/**
 * Nep-Unipile voor de end-to-end tests. Gedraagt zich zoals de officiële
 * documentatie (docs/UNIPILE.md): zelfde paden, velden en foutcodes, en
 * controleert wat de app meestuurt (API-key, account_id, max. 10 per pagina
 * bij classic, geen melding bij profielbezoek).
 */
import http from "node:http";

export const FAKE_KEY = "unipile_test_key";
export const FAKE_ACCOUNT = "acc_test";

const PEOPLE = [
  ["Jan Bakker", "TIG-lasser RVS bij Staalbouw Venlo", "Venlo, Limburg, Netherlands"],
  ["Kees Jansen", "Lasser MIG/MAG", "Roermond, Limburg, Netherlands"],
  ["Piet de Groot", "Constructiebankwerker / lasser", "Weert, Limburg, Netherlands"],
  ["Thabo Nkosi", "Coded Welder TIG/ARC", "Secunda, Mpumalanga, South Africa"],
  ["Johan van der Merwe", "Pipe Welder 6G", "Pretoria, Gauteng, South Africa"],
  ["Sanne Willems", "TIG-lasser aluminium", "Maastricht, Limburg, Netherlands"],
  ["Mark Peeters", "Allround lasser", "Sittard, Limburg, Netherlands"],
  ["Ruud Hendriks", "Lasser RVS leidingwerk", "Heerlen, Limburg, Netherlands"],
  ["Lerato Dlamini", "Boilermaker / Welder", "Johannesburg, Gauteng, South Africa"],
  ["Bas Smeets", "Orbitaallasser", "Venray, Limburg, Netherlands"],
  ["Tom Vos", "Lasser in opleiding", "Venlo, Limburg, Netherlands"],
  ["Wim Claessens", "TIG-lasser", "Echt, Limburg, Netherlands"],
  ["Verdwenen Profiel", "Lasser", "Venlo, Limburg, Netherlands"],
].map(([name, headline, location], i) => {
  const n = String(i + 1).padStart(2, "0");
  const slug = name.toLowerCase().replaceAll(" ", "-");
  return {
    id: `ACoAAFake${n}`,
    public_identifier: slug,
    name,
    first_name: name.split(" ")[0],
    last_name: name.split(" ").slice(1).join(" "),
    headline,
    location,
  };
});

/** Profiel 13 bestaat niet meer (404), om foutafhandeling te testen. */
export const MISSING_PROFILE_ID = "ACoAAFake13";
export const FAKE_PEOPLE = PEOPLE;

export async function startFakeUnipile(port) {
  const requests = [];
  const state = { mode: "ok" }; // "ok" | "disconnected"

  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const url = new URL(req.url, "http://fake");
      requests.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body: raw ? JSON.parse(raw) : null, at: Date.now(), apiKey: req.headers["x-api-key"] });
      const send = (code, obj) => {
        res.writeHead(code, { "content-type": "application/json" });
        res.end(JSON.stringify(obj));
      };
      if (req.headers["x-api-key"] !== FAKE_KEY || url.searchParams.get("account_id") !== FAKE_ACCOUNT || state.mode === "disconnected") {
        return send(401, { status: 401, type: "errors/disconnected_account", title: "Disconnected account" });
      }

      if (req.method === "GET" && url.pathname === "/api/v1/linkedin/search/parameters") {
        const kw = url.searchParams.get("keywords") ?? "";
        if (url.searchParams.get("type") !== "LOCATION") return send(400, { status: 400, type: "errors/invalid_parameters" });
        return send(200, {
          object: "LinkedinSearchParametersList",
          items: [
            { object: "LinkedinSearchParameter", title: `${kw}, Nederland`, id: "90009706" },
            { object: "LinkedinSearchParameter", title: `${kw}, België`, id: "90009707" },
          ],
          paging: { page_count: 2 },
        });
      }

      if (req.method === "POST" && url.pathname === "/api/v1/linkedin/search") {
        const body = raw ? JSON.parse(raw) : {};
        const limit = Number(url.searchParams.get("limit") ?? 10);
        if (body.api !== "classic" || body.category !== "people") {
          return send(400, { status: 400, type: "errors/invalid_parameters", detail: "api/category" });
        }
        if (limit > 10) return send(400, { status: 400, type: "errors/invalid_parameters", detail: "Classic people: max 10 per page" });
        const cursor = url.searchParams.get("cursor");
        const start = cursor ? JSON.parse(Buffer.from(cursor, "base64").toString()).start : 0;
        const page = PEOPLE.slice(start, start + limit);
        const next = start + limit < PEOPLE.length ? Buffer.from(JSON.stringify({ start: start + limit })).toString("base64") : null;
        return send(200, {
          object: "LinkedinSearch",
          items: page.map((p) => ({
            object: "SearchResult",
            type: "PEOPLE",
            id: p.id,
            public_identifier: p.public_identifier,
            public_profile_url: `https://www.linkedin.com/in/${p.public_identifier}`,
            profile_url: `https://www.linkedin.com/in/${p.public_identifier}?miniProfileUrn=urn%3Ali%3Afs_miniProfile%3A${p.id}`,
            profile_picture_url: null,
            profile_picture_url_large: null,
            member_urn: `urn:li:member:${p.id}`,
            name: p.name,
            network_distance: "DISTANCE_2",
            location: p.location,
            industry: null,
            headline: p.headline,
          })),
          config: { params: body },
          paging: { start, page_count: page.length, total_count: PEOPLE.length },
          cursor: next,
        });
      }

      const profile = url.pathname.match(/^\/api\/v1\/users\/([^/]+)$/);
      if (req.method === "GET" && profile) {
        const id = decodeURIComponent(profile[1]);
        const p = PEOPLE.find((x) => x.id === id || x.public_identifier === id);
        if (!p || p.id === MISSING_PROFILE_ID) return send(404, { status: 404, type: "errors/resource_not_found", title: "Not found" });
        return send(200, {
          object: "UserProfile",
          provider: "LINKEDIN",
          provider_id: p.id,
          public_identifier: p.public_identifier,
          public_profile_url: `https://www.linkedin.com/in/${p.public_identifier}`,
          first_name: p.first_name,
          last_name: p.last_name,
          headline: p.headline,
          location: p.location,
          summary: "Ervaren lasser.",
          websites: [],
          network_distance: "SECOND_DEGREE",
          // Mag NIET overgenomen worden (besluit: e-mail alleen handmatig).
          contact_info: { emails: [`${p.public_identifier}@example.com`], phones: ["+31612345678"] },
          work_experience: [
            { position: p.headline, company: "Huidig Bedrijf BV", location: p.location, start: "1/2021", end: null, skills: [] },
            { position: "Leerling-lasser", company: "Vorig Bedrijf BV", location: p.location, start: "1/2017", end: "12/2020", skills: [] },
          ],
          skills: [
            { name: "TIG", endorsement_count: 4 },
            { name: "RVS", endorsement_count: 2 },
          ],
        });
      }

      send(404, { status: 404, type: "errors/resource_not_found" });
    });
  });

  await new Promise((resolve) => server.listen(port, resolve));
  return { server, requests, state };
}
