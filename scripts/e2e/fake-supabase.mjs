/**
 * Nep-Supabase voor de end-to-end tests, met een ECHTE Postgres-database
 * erachter (PGlite) waarin alle migraties uit supabase/migrations draaien.
 * Zo gelden in de test dezelfde regels, triggers en unieke sleutels als in
 * productie.
 *
 * Ondersteunt alleen het deel van de Supabase REST-API (PostgREST) dat de app
 * gebruikt: select met kolommen, filters (eq, neq, in, is, ilike, like, gt,
 * gte, lt, lte), or=(...), order, limit/offset, count, single, insert, update
 * en delete. Plus de twee auth-endpoints die het inloggen nodig heeft.
 *
 * Draait als database-superuser, net als de service-key: Row Level Security
 * wordt hier dus niet getest (dat doet scripts/test-database.mjs).
 */
import { readdirSync, readFileSync } from "node:fs";
import http from "node:http";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";

export const MOCK_USER = {
  id: "11111111-1111-1111-1111-111111111111",
  aud: "authenticated",
  role: "authenticated",
  email: "sunny@cr8las.nl",
  app_metadata: {},
  user_metadata: {},
  created_at: new Date().toISOString(),
};

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "*",
  "access-control-expose-headers": "*",
};

const IDENT = /^[a-z_][a-z0-9_]*$/;
const ident = (name) => {
  if (!IDENT.test(name)) throw Object.assign(new Error(`Ongeldige naam: ${name}`), { code: "PGRST100" });
  return `"${name}"`;
};

/** Splitst "a,b,(c,d)" op komma's buiten aanhalingstekens en haakjes. */
function splitTop(value) {
  const out = [];
  let depth = 0;
  let quoted = false;
  let cur = "";
  for (const ch of value) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && ch === "(") depth++;
    if (!quoted && ch === ")") depth--;
    if (!quoted && depth === 0 && ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out.map((s) => s.trim());
}

const unquote = (s) => (s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s);

/** Eén filter "col", "op.waarde" → SQL met parameters. */
function filterSql(col, expr, params) {
  const dot = expr.indexOf(".");
  let op = expr.slice(0, dot);
  let value = expr.slice(dot + 1);
  let negate = false;
  if (op === "not") {
    negate = true;
    const d2 = value.indexOf(".");
    op = value.slice(0, d2);
    value = value.slice(d2 + 1);
  }
  const c = ident(col);
  const p = (v) => {
    params.push(v);
    return `$${params.length}`;
  };
  let sql;
  switch (op) {
    case "eq":
      sql = `${c}::text = ${p(value)}`;
      break;
    case "neq":
      sql = `${c}::text <> ${p(value)}`;
      break;
    case "in":
      sql = `${c}::text = ANY(${p(splitTop(value.replace(/^\(|\)$/g, "")).map(unquote))}::text[])`;
      break;
    case "is":
      sql = `${c} IS ${{ null: "NULL", true: "TRUE", false: "FALSE" }[value] ?? "NULL"}`;
      break;
    case "ilike":
    case "like":
      sql = `${c}::text ${op === "ilike" ? "ILIKE" : "LIKE"} ${p(value.replaceAll("*", "%"))}`;
      break;
    case "gt":
    case "gte":
    case "lt":
    case "lte":
      sql = `${c} ${{ gt: ">", gte: ">=", lt: "<", lte: "<=" }[op]} ${p(value)}`;
      break;
    default:
      throw Object.assign(new Error(`Filter niet ondersteund in nep-Supabase: ${op}`), { code: "PGRST100" });
  }
  return negate ? `NOT (${sql})` : sql;
}

function buildWhere(url, params) {
  const reserved = new Set(["select", "order", "limit", "offset", "or", "columns", "on_conflict"]);
  const parts = [];
  for (const [key, value] of url.searchParams) {
    if (reserved.has(key)) continue;
    parts.push(filterSql(key, value, params));
  }
  const or = url.searchParams.get("or");
  if (or) {
    const items = splitTop(or.replace(/^\(|\)$/g, "")).map((item) => {
      const dot = item.indexOf(".");
      return filterSql(item.slice(0, dot), item.slice(dot + 1), params);
    });
    parts.push(`(${items.join(" OR ")})`);
  }
  return parts.length ? `WHERE ${parts.join(" AND ")}` : "";
}

function selectCols(url) {
  const select = (url.searchParams.get("select") ?? "*").replace(/\s/g, "");
  if (select === "*" || select === "") return "*";
  if (select.includes("(")) throw Object.assign(new Error("Embedding niet ondersteund in nep-Supabase"), { code: "PGRST100" });
  return select.split(",").map(ident).join(", ");
}

function orderSql(url) {
  const order = url.searchParams.get("order");
  if (!order) return "";
  return (
    "ORDER BY " +
    order
      .split(",")
      .map((o) => {
        const [col, dir, nulls] = o.split(".");
        return `${ident(col)} ${dir === "desc" ? "DESC" : "ASC"}${nulls === "nullsfirst" ? " NULLS FIRST" : nulls === "nullslast" ? " NULLS LAST" : ""}`;
      })
      .join(", ")
  );
}

const json = (value) =>
  JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? Number(v) : v));

export async function startFakeSupabase(port, { migrationsDir } = {}) {
  const db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role anon;
    create role authenticated;
    create role service_role;
    insert into auth.users values ('${MOCK_USER.id}', '${MOCK_USER.email}');
  `);
  const dir = migrationsDir ?? join(import.meta.dirname, "..", "..", "supabase", "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(dir, file), "utf8"));
  }

  const columnTypes = new Map();
  async function typesOf(table) {
    if (!columnTypes.has(table)) {
      const { rows } = await db.query(
        `select column_name, data_type, udt_name from information_schema.columns where table_schema = 'public' and table_name = $1`,
        [table],
      );
      columnTypes.set(table, new Map(rows.map((r) => [r.column_name, r.data_type === "ARRAY" ? `${r.udt_name.slice(1)}[]` : r.data_type])));
    }
    return columnTypes.get(table);
  }

  /** Waarde + cast voor een kolom (jsonb als tekst, arrays als array). */
  function valueSql(type, value, params) {
    if (value === null || value === undefined) return "NULL";
    if (type === "jsonb" || type === "json") {
      params.push(JSON.stringify(value));
      return `$${params.length}::jsonb`;
    }
    if (type?.endsWith("[]")) {
      params.push(value);
      return `$${params.length}::${type}`;
    }
    params.push(value);
    return `$${params.length}`;
  }

  const requests = [];

  /** POST /rest/v1/rpc/<functie>: databasefunctie aanroepen met benoemde argumenten. */
  async function handleRpc(res, fn, args) {
    const name = ident(fn);
    const { rows: procs } = await db.query(
      `select proretset from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`,
      [fn],
    );
    if (!procs.length) throw Object.assign(new Error(`Functie ${fn} bestaat niet`), { code: "PGRST202" });
    const params = [];
    const argSql = Object.entries(args ?? {})
      .map(([k, v]) => {
        params.push(v !== null && typeof v === "object" ? JSON.stringify(v) : v);
        return `${ident(k)} => $${params.length}`;
      })
      .join(", ");
    const headers = { ...cors, "content-type": "application/json" };
    if (procs[0].proretset) {
      const { rows } = await db.query(`SELECT * FROM public.${name}(${argSql})`, params);
      res.writeHead(200, headers);
      return res.end(json(rows));
    }
    const { rows } = await db.query(`SELECT public.${name}(${argSql}) AS result`, params);
    res.writeHead(200, headers);
    res.end(json(rows[0]?.result ?? null));
  }

  async function handleRest(req, res, url, body) {
    const table = url.pathname.replace("/rest/v1/", "");
    const t = ident(table);
    const prefer = req.headers.prefer ?? "";
    const wantsObject = (req.headers.accept ?? "").includes("vnd.pgrst.object");
    const returning = prefer.includes("return=representation") ? `RETURNING ${selectCols(url)}` : "";
    const types = await typesOf(table);
    const params = [];
    let rows;
    let total = null;

    if (req.method === "GET" || req.method === "HEAD") {
      const where = buildWhere(url, params);
      const limit = url.searchParams.get("limit");
      const offset = url.searchParams.get("offset");
      const sql = `SELECT ${selectCols(url)} FROM public.${t} ${where} ${orderSql(url)} ${limit ? `LIMIT ${Number(limit)}` : ""} ${offset ? `OFFSET ${Number(offset)}` : ""}`;
      rows = (await db.query(sql, params)).rows;
      if (prefer.includes("count=exact")) {
        const countParams = [];
        total = (await db.query(`SELECT count(*)::int AS n FROM public.${t} ${buildWhere(url, countParams)}`, countParams)).rows[0].n;
      }
    } else if (req.method === "POST") {
      const items = Array.isArray(body) ? body : [body];
      const cols = [...new Set(items.flatMap((i) => Object.keys(i)))];
      const values = items
        .map((item) => `(${cols.map((c) => (c in item ? valueSql(types.get(c), item[c], params) : "DEFAULT")).join(", ")})`)
        .join(", ");
      rows = (await db.query(`INSERT INTO public.${t} (${cols.map(ident).join(", ")}) VALUES ${values} ${returning}`, params)).rows;
    } else if (req.method === "PATCH") {
      const sets = Object.entries(body).map(([c, v]) => `${ident(c)} = ${valueSql(types.get(c), v, params)}`);
      const where = buildWhere(url, params);
      rows = (await db.query(`UPDATE public.${t} SET ${sets.join(", ")} ${where} ${returning}`, params)).rows;
    } else if (req.method === "DELETE") {
      const where = buildWhere(url, params);
      rows = (await db.query(`DELETE FROM public.${t} ${where} ${returning}`, params)).rows;
    } else {
      res.writeHead(405, cors);
      return res.end();
    }

    const headers = { ...cors, "content-type": "application/json" };
    if (total !== null) headers["content-range"] = rows.length ? `0-${rows.length - 1}/${total}` : `*/${total}`;

    if (wantsObject) {
      if (rows.length !== 1) {
        res.writeHead(406, headers);
        return res.end(json({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `${rows.length} rows`, hint: null }));
      }
      res.writeHead(200, headers);
      return res.end(json(rows[0]));
    }
    const status = req.method === "POST" ? 201 : req.method === "HEAD" ? 200 : 200;
    if (!returning && req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(req.method === "POST" ? 201 : 204, headers);
      return res.end();
    }
    res.writeHead(status, headers);
    res.end(req.method === "HEAD" ? undefined : json(rows));
  }

  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", async () => {
      requests.push({ method: req.method, url: req.url, auth: Boolean(req.headers.authorization), apikey: req.headers.apikey ?? "", body: raw });
      if (req.method === "OPTIONS") {
        res.writeHead(204, cors);
        return res.end();
      }
      const send = (code, obj) => {
        res.writeHead(code, { ...cors, "content-type": "application/json" });
        res.end(json(obj));
      };
      const url = new URL(req.url, "http://fake");
      try {
        if (url.pathname.startsWith("/auth/v1/otp")) return send(200, {});
        if (url.pathname.startsWith("/auth/v1/user")) {
          return req.headers.authorization ? send(200, MOCK_USER) : send(401, { code: "no_authorization" });
        }
        if (url.pathname.startsWith("/rest/v1/rpc/")) {
          return await handleRpc(res, url.pathname.slice("/rest/v1/rpc/".length), raw ? JSON.parse(raw) : {});
        }
        if (url.pathname.startsWith("/rest/v1/")) {
          return await handleRest(req, res, url, raw ? JSON.parse(raw) : {});
        }
        send(404, { message: "Niet gevonden" });
      } catch (e) {
        const code = e.code ?? "XX000";
        const status = code === "23505" ? 409 : code.startsWith("PGRST") ? 400 : 400;
        send(status, { code, message: e.message, details: e.detail ?? null, hint: null });
      }
    });
  });

  await new Promise((resolve) => server.listen(port, resolve));
  return { server, requests, db };
}
