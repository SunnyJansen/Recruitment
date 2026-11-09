/* eslint-disable @typescript-eslint/no-unused-expressions -- korte ok/fail-checks */
/**
 * Test van de database-migratie, zonder Supabase-account.
 * Draait de SQL in een lokale nep-Postgres (PGlite) en controleert de
 * harde regels uit CLAUDE.md.
 *
 * Gebruik:  npm run test:db
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
let passed = 0;
let failed = 0;

function ok(name) {
  passed++;
  console.log(`  ✓ ${name}`);
}
function fail(name, err) {
  failed++;
  console.log(`  ✗ ${name}\n      ${err}`);
}
async function expectOk(name, fn) {
  try {
    await fn();
    ok(name);
  } catch (e) {
    fail(name, e.message);
  }
}
async function expectError(name, fn, pattern) {
  try {
    await fn();
    fail(name, "verwachtte een fout, maar het lukte");
  } catch (e) {
    if (pattern && !pattern.test(e.message)) fail(name, `andere fout: ${e.message}`);
    else ok(name);
  }
}

// --- Supabase nabootsen: auth-schema, rollen en auth.uid() ---------------
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon;
  create role authenticated;
  create role service_role;
  grant usage on schema public, auth to anon, authenticated;
  insert into auth.users values ('11111111-1111-1111-1111-111111111111', 'sunny@cr8las.nl');
`);

// --- Migraties draaien ---------------------------------------------------
console.log("Migraties:");
const dir = join(import.meta.dirname, "..", "supabase", "migrations");
for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  await expectOk(file, () => db.exec(readFileSync(join(dir, file), "utf8")));
}
await db.exec(`
  grant all on all tables in schema public to authenticated;
  grant all on all sequences in schema public to authenticated;
`);

const USER = "11111111-1111-1111-1111-111111111111";
const asUser = `set role authenticated; set request.jwt.claim.sub = '${USER}';`;
const asSystem = `reset role; set request.jwt.claim.sub = '';`;
const asAnon = `set role anon; set request.jwt.claim.sub = '';`;

console.log("\nTabellen:");
const tables = (
  await db.query(`select table_name from information_schema.tables where table_schema = 'public' order by 1`)
).rows.map((r) => r.table_name);
for (const t of ["vacancies", "candidates", "candidate_vacancy", "messages", "follow_ups", "searches", "activity_log", "settings", "do_not_contact"]) {
  tables.includes(t) ? ok(`tabel ${t} bestaat`) : fail(`tabel ${t} bestaat`, "ontbreekt");
}
const settingsCount = (await db.query(`select count(*)::int as n from settings`)).rows[0].n;
settingsCount >= 20 ? ok(`${settingsCount} standaardinstellingen`) : fail("standaardinstellingen", `maar ${settingsCount}`);

console.log("\nRegel 1 — geen bericht zonder goedkeuring:");
await db.exec(asUser);
const cand = (await db.query(`insert into candidates (full_name, linkedin_provider_id, email) values ('Test Lasser', 'ACoTEST123', 'Lasser@Example.com') returning id`)).rows[0].id;
const vac = (await db.query(`insert into vacancies (title) values ('TIG-lasser') returning id`)).rows[0].id;
await db.query(`insert into candidate_vacancy (candidate_id, vacancy_id) values ($1, $2)`, [cand, vac]);

await expectError("nieuw uitgaand bericht direct als 'approved' wordt geweigerd", () =>
  db.query(`insert into messages (candidate_id, channel, direction, body, status) values ($1, 'linkedin_invite', 'out', 'Hoi', 'approved')`, [cand]),
);
const msg = (await db.query(`insert into messages (candidate_id, vacancy_id, channel, direction, body) values ($1, $2, 'linkedin_invite', 'out', 'Hoi') returning id`, [cand, vac])).rows[0].id;
ok("concept aanmaken lukt");

await db.exec(asSystem);
await expectError("systeem (AI/cron) kan niet goedkeuren", () =>
  db.query(`update messages set status = 'approved' where id = $1`, [msg]), /ingelogde gebruiker/);
await expectError("concept kan niet direct in de wachtrij", () =>
  db.query(`update messages set status = 'queued' where id = $1`, [msg]), /goedgekeurde/);
await expectError("concept kan niet direct verzonden worden", () =>
  db.query(`update messages set status = 'sent' where id = $1`, [msg]), /goedgekeurde/);

await db.exec(asUser);
await expectOk("ingelogde gebruiker keurt goed", () => db.query(`update messages set status = 'approved' where id = $1`, [msg]));
const approved = (await db.query(`select approved_by from messages where id = $1`, [msg])).rows[0];
approved.approved_by === USER ? ok("goedkeurder wordt vastgelegd") : fail("goedkeurder vastgelegd", approved.approved_by);
await expectError("tekst van goedgekeurd bericht kan niet meer veranderen", () =>
  db.query(`update messages set body = 'Andere tekst' where id = $1`, [msg]));

await db.exec(asSystem);
await expectOk("systeem zet goedgekeurd bericht in de wachtrij", () => db.query(`update messages set status = 'queued' where id = $1`, [msg]));
await expectOk("systeem markeert het als verzonden", () => db.query(`update messages set status = 'sent', sent_at = now() where id = $1`, [msg]));

console.log("\nRegel 3 — afmelden = nooit meer benaderen:");
await db.exec(asUser);
const draft2 = (await db.query(`insert into messages (candidate_id, channel, direction, body) values ($1, 'linkedin_message', 'out', 'Opvolging') returning id`, [cand])).rows[0].id;
await db.query(`insert into follow_ups (candidate_id, due_at, step) values ($1, now() + interval '4 days', 1)`, [cand]);
await expectOk("kandidaat meldt zich af", () => db.query(`update candidates set status = 'opted_out' where id = $1`, [cand]));

const after = (await db.query(`select
  (select stage from candidate_vacancy where candidate_id = $1) as stage,
  (select status from messages where id = $2) as draft_status,
  (select bool_and(done) from follow_ups where candidate_id = $1) as followups_done,
  (select count(*)::int from do_not_contact) as dnc`, [cand, draft2])).rows[0];
after.stage === "opted_out" ? ok("stage → opted_out") : fail("stage → opted_out", after.stage);
after.draft_status === "rejected" ? ok("open concepten geannuleerd") : fail("open concepten geannuleerd", after.draft_status);
after.followups_done ? ok("opvolging gestopt") : fail("opvolging gestopt", after.followups_done);
after.dnc === 2 ? ok("LinkedIn-id en e-mail op niet-benaderen-lijst (als hash)") : fail("niet-benaderen-lijst", after.dnc);

await expectError("nieuw bericht naar afgemelde kandidaat wordt geweigerd", () =>
  db.query(`insert into messages (candidate_id, channel, direction, body) values ($1, 'email', 'out', 'Hoi')`, [cand]), /afgemeld/);

await db.query(`delete from candidates where id = $1`, [cand]);
const reimported = (await db.query(`insert into candidates (full_name, linkedin_provider_id) values ('Test Lasser', 'ACoTEST123') returning status`)).rows[0];
reimported.status === "opted_out" ? ok("opnieuw importeren → meteen weer opted_out") : fail("opnieuw importeren", reimported.status);
const byEmail = (await db.query(`insert into candidates (full_name, email) values ('Zelfde persoon', ' lasser@example.COM ') returning status`)).rows[0];
byEmail.status === "opted_out" ? ok("herkenning op e-mail (hoofdletters/spaties maken niet uit)") : fail("herkenning op e-mail", byEmail.status);

console.log("\nDedupliceren:");
await expectOk("kandidaat A", () => db.query(`insert into candidates (full_name, linkedin_provider_id) values ('A', 'ACoDUP')`));
await expectError("tweede kandidaat met zelfde LinkedIn-id wordt geweigerd", () =>
  db.query(`insert into candidates (full_name, linkedin_provider_id) values ('A', 'ACoDUP')`), /unique|duplicate/i);

console.log("\nFase 2:");
await expectOk("kandidaat met LinkedIn-link", () =>
  db.query(`insert into candidates (full_name, linkedin_url) values ('B', 'https://www.linkedin.com/in/b-lasser')`));
await expectError("tweede kandidaat met dezelfde LinkedIn-link wordt geweigerd", () =>
  db.query(`insert into candidates (full_name, linkedin_url) values ('B2', 'https://www.linkedin.com/in/b-lasser')`), /unique|duplicate/i);
await expectOk("meerdere kandidaten zonder LinkedIn-link mogen", () =>
  db.query(`insert into candidates (full_name) values ('Zonder 1'), ('Zonder 2')`));

await expectOk("handmatige kandidaat (alleen LinkedIn-link) afmelden", () =>
  db.query(`update candidates set status = 'opted_out' where linkedin_url = 'https://www.linkedin.com/in/b-lasser'`));
const dncUrl = (await db.query(`select count(*)::int as n from do_not_contact where kind = 'linkedin_url'`)).rows[0].n;
dncUrl === 1 ? ok("LinkedIn-link (als hash) op niet-benaderen-lijst") : fail("LinkedIn-link op lijst", dncUrl);
await expectError("afgemelde kandidaat kan niet terug naar actief", () =>
  db.query(`update candidates set status = 'active' where linkedin_url = 'https://www.linkedin.com/in/b-lasser'`), /AVG/);
await db.query(`delete from candidates where linkedin_url = 'https://www.linkedin.com/in/b-lasser'`);
const readded = (await db.query(`insert into candidates (full_name, linkedin_url) values ('B opnieuw', 'https://www.linkedin.com/in/b-lasser') returning status`)).rows[0];
readded.status === "opted_out" ? ok("opnieuw toevoegen met zelfde LinkedIn-link → meteen afgemeld") : fail("opnieuw toevoegen", readded.status);

console.log("\nFase 3 — LinkedIn-limieten (regel 2):");
const slot = async () => (await db.query(`select public.linkedin_take_slot('profile_view', 2, null, 30, 120) as r`)).rows[0].r;
await db.exec(asSystem);
const s1 = await slot();
s1.ok && s1.wait_seconds >= 30 && s1.wait_seconds <= 120 ? ok(`eerste profielbezoek mag; volgende pas na ${s1.wait_seconds} s`) : fail("eerste profielbezoek", JSON.stringify(s1));
const s2 = await slot();
!s2.ok && s2.reason === "wait" && s2.wait_seconds > 0 ? ok("direct daarna: wachten (geen bulk)") : fail("direct daarna wachten", JSON.stringify(s2));
await db.query(`update rate_state set next_at = now() - interval '1 second'`);
const s3 = await slot();
await db.query(`update rate_state set next_at = now() - interval '1 second'`);
const s4 = await slot();
s3.ok && !s4.ok && s4.reason === "daily_limit" ? ok("daglimiet (2) wordt afgedwongen") : fail("daglimiet", JSON.stringify([s3, s4]));
const wk = (await db.query(`select public.linkedin_take_slot('invite', 100, 1, 0, 0) as a, public.linkedin_take_slot('invite', 100, 1, 0, 0) as b`)).rows[0];
wk.a.ok && !wk.b.ok && wk.b.reason === "weekly_limit" ? ok("weeklimiet wordt afgedwongen") : fail("weeklimiet", JSON.stringify(wk));
const sr = (await db.query(`select public.linkedin_record_search(990, 1000) as a, public.linkedin_record_search(25, 1000) as b, public.linkedin_record_search(25, 1000) as c`)).rows[0];
sr.a.ok && sr.b.ok && !sr.c.ok ? ok("max. zoekresultaten per dag") : fail("zoekresultaten per dag", JSON.stringify(sr));

const vacId = (await db.query(`insert into vacancies (title) values ('Q') returning id`)).rows[0].id;
await db.query(`insert into import_queue (vacancy_id, provider_id, name) values ($1, 'ACoA1', 'Een'), ($1, 'ACoA2', 'Twee')`, [vacId]);
await expectError("zelfde persoon niet twee keer tegelijk in de wachtrij", () =>
  db.query(`insert into import_queue (vacancy_id, provider_id) values ($1, 'ACoA1')`, [vacId]), /unique|duplicate/i);
const c1 = (await db.query(`select * from public.claim_next_import($1)`, [vacId])).rows;
const c2 = (await db.query(`select * from public.claim_next_import($1)`, [vacId])).rows;
const c3 = (await db.query(`select * from public.claim_next_import($1)`, [vacId])).rows;
c1[0]?.provider_id === "ACoA1" && c2[0]?.provider_id === "ACoA2" && c3.length === 0
  ? ok("wachtrij geeft items één voor één, op volgorde, nooit dubbel")
  : fail("wachtrij", JSON.stringify([c1, c2, c3]));
await db.exec(asUser);

console.log("\nLogboek en beveiliging:");
await expectOk("gebruiker schrijft in activity_log", () =>
  db.query(`insert into activity_log (actor, actor_id, action, entity) values ('user', $1, 'test', 'test')`, [USER]));
await expectError("gebruiker kan niet loggen namens iemand anders", () =>
  db.query(`insert into activity_log (actor, actor_id, action, entity) values ('user', gen_random_uuid(), 'test', 'test')`));
const delLog = await db.query(`delete from activity_log`);
delLog.affectedRows === 0 ? ok("logboek kan niet gewist worden") : fail("logboek kan niet gewist worden", `${delLog.affectedRows} rijen weg`);

await db.exec(asSystem + `grant select on all tables in schema public to anon;` + asAnon);
const anonRows = (await db.query(`select count(*)::int as n from candidates`)).rows[0].n;
anonRows === 0 ? ok("niet-ingelogd ziet geen kandidaten") : fail("niet-ingelogd ziet geen kandidaten", `${anonRows} zichtbaar`);

console.log(`\n${passed} geslaagd, ${failed} mislukt`);
process.exit(failed ? 1 : 0);
