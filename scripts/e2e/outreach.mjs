/* eslint-disable @typescript-eslint/no-unused-expressions -- korte ok/fail-checks */
/**
 * End-to-end test van "automatisch benaderen": campagne instellen en
 * goedkeuren in de browser, daarna de cron-tikken naspelen (zoeken,
 * uitnodigen, accepteren, bericht, reactie, afmelding) tegen een nep-Supabase
 * (echte database) en een nep-Unipile (v2). Testmodus (teamwachtwoord).
 *
 * Gebruik: zie scripts/e2e/login.mjs (zelfde build).  SCREENSHOTS=map voor beelden.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";

import { chromium } from "playwright";

import { startFakeSupabase } from "./fake-supabase.mjs";
import { FAKE_ACCOUNT, FAKE_KEY, FAKE_PEOPLE, startFakeUnipile } from "./fake-unipile.mjs";

const APP_PORT = 3130;
const APP = `http://localhost:${APP_PORT}`;
const PASSWORD = "Lassen-Is-Leuk-2026";
const CRON_SECRET = "cron-secret-voor-de-test-1234567890";
const SHOTS = process.env.SCREENSHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

let failed = 0;
const check = (name, cond, info = "") => {
  cond ? console.log(`  ✓ ${name}`) : (failed++, console.log(`  ✗ ${name}\n      ${info}`));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (await fetch(APP).then(() => true).catch(() => false)) {
  console.error(`Poort ${APP_PORT} is al in gebruik. Stop die server eerst.`);
  process.exit(1);
}

const { server: supaServer, db } = await startFakeSupabase(54321);
const unipile = await startFakeUnipile(54400);
const q = async (sql, params) => (await db.query(sql, params)).rows;

const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_e2e_test_key_0000",
  SITE_PASSWORD: PASSWORD,
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_e2e_service_key_9999",
  UNIPILE_DSN: "http://localhost:54400",
  UNIPILE_API_KEY: FAKE_KEY,
  UNIPILE_ACCOUNT_ID: FAKE_ACCOUNT,
  CRON_SECRET,
};
const app = spawn("npx", ["next", "start", "-p", String(APP_PORT)], { env, stdio: "ignore", detached: true });
for (let i = 0; i < 60; i++) {
  if (await fetch(`${APP}/login`).then((r) => r.ok).catch(() => false)) break;
  await sleep(500);
}

const executablePath = existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const shot = async (name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
const seen = (locator, timeout = 4000) =>
  locator.filter({ visible: true }).first().waitFor({ timeout }).then(() => true).catch(() => false);

/** Eén cron-tik, zoals cron-job.org die doet. */
async function tick(headers = { authorization: `Bearer ${CRON_SECRET}` }) {
  const r = await fetch(`${APP}/api/cron/outreach`, { headers });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
/** Tikken tot een voorwaarde klopt (de database dwingt pauzes af). */
async function tickUntil(cond, max = 40) {
  for (let i = 0; i < max; i++) {
    const r = await tick();
    if (await cond(r)) return r;
    await sleep(700);
  }
  return null;
}
const forceCheck = (key) => q(`update rate_state set next_at = now() - interval '1 second' where key = $1`, [key]);

// Testgegevens en snelle instellingen.
const [vac] = await q(`insert into vacancies (title, location, requirements) values ('TIG-lasser', 'Venlo', '{"lasprocessen":["TIG (141)"]}') returning id`);
await q(`update settings set value = '0' where key = 'delay_min_seconds'`);
await q(`update settings set value = '1' where key = 'delay_max_seconds'`);
await q(`update settings set value = '[1,2,3,4,5,6,7]' where key = 'work_days'`);
await q(`update settings set value = '{"start":"00:00","end":"23:59"}' where key = 'work_hours'`);
await q(`update settings set value = 'false' where key = 'skip_dutch_holidays'`);
await q(`update settings set value = '4' where key = 'max_invites_per_day'`);
unipile.state.noteLimit = 2; // LinkedIn weigert de 3e uitnodiging mét tekst

try {
  console.log("Campagne instellen en goedkeuren:");
  await page.goto(`${APP}/login`, { waitUntil: "networkidle" });
  await page.fill("#password", PASSWORD);
  await Promise.all([page.waitForURL(`${APP}/`, { timeout: 15000 }), page.getByRole("button", { name: "Log in" }).click()]);
  await page.goto(`${APP}/vacatures/${vac.id}`, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "Automatisch benaderen" }).click();
  await page.waitForURL(`${APP}/vacatures/${vac.id}/automatisch`);
  await page.waitForLoadState("networkidle");
  check("status Concept", await seen(page.getByText("Concept", { exact: true })));
  check("standaardtekst NL ingevuld", (await page.inputValue("#c-nl")).includes("Ik vond je profiel op LinkedIn"));
  check("voorbeeld met naam en afzender", await seen(page.getByText(/Hoi Jan,/)) && (await seen(page.getByText(/Sunny Jansen/))));
  check("Engels voorbeeld", await seen(page.getByText(/Hi Thabo,/)));
  check("uitnodigingstekst vooraf ingevuld", (await page.inputValue("#c-note-nl")).includes("profiel op LinkedIn"));
  check("tekenteller uitnodiging", await seen(page.getByText(/\d+ \/ 200 tekens/)));
  const note = await page.inputValue("#c-note-nl");
  await page.fill("#c-note-nl", note + " " + "Extra uitleg over de baan en het bedrijf zodat het veel te lang wordt.".repeat(2));
  check("te lange uitnodigingstekst gemeld", await seen(page.getByText(/LinkedIn staat er 200 toe/)));
  await page.fill("#c-note-nl", note);

  const nl = await page.inputValue("#c-nl");
  await page.fill("#c-nl", nl.replace("op LinkedIn", "online").replace("Geen interesse? Laat het weten, dan benader ik je niet meer.", ""));
  check("AVG-controle: bron en afmeldoptie verplicht", (await seen(page.getByText(/moet de bron noemen/))) && (await seen(page.getByText(/afmeldoptie/))));
  check("goedkeuren geblokkeerd bij fouten", await page.getByRole("button", { name: "Keur goed en start" }).isDisabled());
  await page.fill("#c-nl", nl);

  await page.getByRole("button", { name: "Zoek locatie" }).click();
  await page.getByRole("group", { name: "Locaties campagne" }).getByText("Venlo, Nederland", { exact: true }).click();
  await page.getByRole("button", { name: "Keur goed en start" }).click();
  check("gestart", await seen(page.getByText("Goedgekeurd en gestart."), 10000));
  await page.waitForLoadState("networkidle");
  check("status Actief", await seen(page.getByText("Actief", { exact: true }), 10000));
  const [camp] = await q(`select * from campaigns where vacancy_id = $1`, [vac.id]);
  check("database: actief, goedgekeurd (testmodus)", camp?.status === "active" && camp?.approved_by_label === "Teamwachtwoord (testmodus)" && camp?.approved_at);
  check("database: locatie en trefwoorden bewaard", JSON.stringify(camp?.search_query?.location_ids) === '["90009706"]' && camp?.search_query?.keywords === "TIG");
  await shot("1-campagne");

  console.log("Cron-beveiliging:");
  check("zonder sleutel geweigerd", (await tick({})).status === 401);
  check("verkeerde sleutel geweigerd", (await tick({ authorization: "Bearer fout-fout-fout-fout-fout" })).status === 401);

  console.log("Dag 1: zoeken en uitnodigen (max. 4 per dag, 2 mét tekst):");
  // Situatie bij Sunny: reacties/connecties ophalen faalt bij Unipile. Uitnodigen moet tóch doorgaan.
  unipile.state.brokenReads = true;
  await forceCheck("relations_check");
  const first = await tickUntil(async (r) => r.body.steps?.some((s) => /nieuwe kandidaten gevonden/.test(s)));
  check("eerste tik zoekt kandidaten", Boolean(first), JSON.stringify(first?.body));
  check("10 kandidaten klaargezet", (await q(`select count(*)::int as n from candidate_vacancy where outreach_status = 'pending'`))[0].n === 10);
  check("geen profielbezoek nodig", (await q(`select count(*)::int as n from linkedin_actions where kind = 'profile_view'`))[0].n === 0);
  await tickUntil(async (r) => r.body.state === "waiting" && (await q(`select count(*)::int as n from linkedin_actions where kind = 'invite'`))[0].n === 4);
  const invites = unipile.requests.filter((r) => r.method === "POST" && r.path === `/v2/${FAKE_ACCOUNT}/users/me/relation-requests`);
  check("4 pogingen (daglimiet 4)", invites.length === 4, String(invites.length));
  check("3 uitnodigingen aangekomen", unipile.state.invited.length === 3, String(unipile.state.invited.length));
  const firstInviteUser = FAKE_PEOPLE.find((p) => p.id === invites[0].body.user_id);
  const expectedStart = /Netherlands/.test(firstInviteUser.location) ? `Hoi ${firstInviteUser.name.split(" ")[0]},` : `Hi ${firstInviteUser.name.split(" ")[0]},`;
  check("eerste uitnodiging mét goedgekeurde tekst", invites[0].body.message?.startsWith(expectedStart) && invites[0].body.message.includes("LinkedIn"), invites[0].body.message);
  check("tekst max. 200 tekens", invites.filter((r) => r.body.message).every((r) => r.body.message.length <= 200));
  check("3e poging was mét tekst (en werd geweigerd)", Boolean(invites[2].body.message) && unipile.state.notesSent === 2);
  check("daarna zonder tekst, zelfde kandidaat opnieuw", !("message" in invites[3].body) && invites[3].body.user_id === invites[2].body.user_id);
  check("database: 2 uitnodigingsteksten verzonden, 1 mislukt", (await q(`select count(*)::int as n from messages where channel = 'linkedin_invite' and status = 'sent'`))[0].n === 2 && (await q(`select count(*)::int as n from messages where channel = 'linkedin_invite' and status = 'failed'`))[0].n === 1);
  check("tekst-uitnodigingen een week gepauzeerd", (await q(`select next_at > now() + interval '6 days' as b from rate_state where key = 'invite_notes'`))[0].b === true);
  check("fase → benaderd", (await q(`select count(*)::int as n from candidate_vacancy where outreach_status = 'invited' and stage = 'contacted'`))[0].n === 3);
  await forceCheck("chats_check");
  await forceCheck("relations_check");
  const extra = await tick();
  check("ophalen faalt, maar de stap loopt door (geen 'error')", extra.body.state !== "error" && extra.body.steps?.some((st) => /Reacties ophalen mislukt/.test(st)) && extra.body.steps?.some((st) => /Connecties controleren mislukt/.test(st)), JSON.stringify(extra.body));
  check("daglimiet: geen 5e poging", extra.body.state === "waiting" && unipile.requests.filter((r) => r.path.endsWith("/relation-requests")).length === 4, JSON.stringify(extra.body));
  check("daglimiet duidelijk gemeld", /Daglimiet bereikt: 4 van 4 uitnodigingen/.test(extra.body.message ?? ""), extra.body.message);
  check("mislukt ophalen blokkeerde het uitnodigen niet", (await q(`select count(*)::int as n from activity_log where action = 'outreach_error'`))[0].n >= 1);
  unipile.state.brokenReads = false;

  console.log("Overzicht op de campagnepagina:");
  await page.goto(`${APP}/vacatures/${vac.id}/automatisch`, { waitUntil: "networkidle" });
  check("motorstatus: laatste stap zichtbaar", (await seen(page.getByText(/Laatste keer:/))) && (await seen(page.getByText(/Daglimiet bereikt/))));
  const table = page.getByRole("table").filter({ visible: true });
  check("tabel: 3 uitgenodigd", (await table.getByText("Uitgenodigd", { exact: true }).count()) === 3);
  check("tabel: met en zonder tekst", (await table.getByText("met tekst", { exact: true }).count()) === 2 && (await table.getByText("zonder tekst", { exact: true }).count()) === 1);
  check("tabel: nog 7 klaar om uit te nodigen", (await table.getByText("Klaar om uit te nodigen", { exact: true }).count()) === 7);
  check("tabel: link naar LinkedIn-profiel", (await table.getByRole("link", { name: /LinkedIn-profiel van/ }).count()) === 10);
  await shot("1b-benaderde-kandidaten");

  console.log("Kandidaten accepteren → bericht:");
  const [jan, kees] = [FAKE_PEOPLE[0], FAKE_PEOPLE[3]]; // Jan (NL) en Thabo (ZA) zitten in de eerste 3 uitnodigingen? controleren:
  const invitedIds = [...unipile.state.invited];
  const nlPerson = FAKE_PEOPLE.find((p) => invitedIds.includes(p.id) && /Netherlands/.test(p.location));
  check("testpersoon uitgenodigd", Boolean(nlPerson), invitedIds.join(","));
  void jan;
  void kees;
  const [secondId] = invitedIds.filter((id) => id !== nlPerson.id);
  unipile.accept(nlPerson.id);
  unipile.accept(secondId);
  await forceCheck("relations_check");
  await tickUntil(async () => (await q(`select count(*)::int as n from candidate_vacancy where outreach_status = 'messaged'`))[0].n === 2);
  const sends = unipile.requests.filter((r) => r.path === `/v2/${FAKE_ACCOUNT}/inboxes/CLASSIC_PRIMARY/chats/send`);
  check("2 berichten verstuurd na acceptatie", sends.length === 2, String(sends.length));
  const nlSend = sends.find((r) => r.body.users_ids === nlPerson.id);
  const firstName = nlPerson.name.split(" ")[0];
  check("1-op-1-gesprek (users_ids als tekst)", sends.every((r) => typeof r.body.users_ids === "string"));
  check("exact de goedgekeurde NL-tekst, ingevuld", nlSend?.body.text.startsWith(`Hoi ${firstName},`) && nlSend.body.text.includes("TIG-lasser in Venlo") && nlSend.body.text.includes("Geen interesse? Laat het weten"), nlSend?.body.text);
  const sentRows = await q(`select * from messages where direction = 'out' and channel = 'linkedin_message'`);
  check("database: bericht 'verzonden' met campagne en goedkeuring", sentRows.length === 2 && sentRows.every((m) => m.status === "sent" && m.campaign_id === camp.id && m.approved_at));

  console.log("Reacties:");
  unipile.reply(nlPerson.id, "Ja, vertel me meer! Wat is het salaris?");
  unipile.reply(secondId, "Geen interesse, bedankt.");
  await forceCheck("chats_check");
  await tickUntil(async () => (await q(`select count(*)::int as n from candidate_vacancy where outreach_status = 'replied'`))[0].n === 2);
  const [nlCand] = await q(`select * from candidates where linkedin_provider_id = $1`, [nlPerson.id]);
  const [nlLink] = await q(`select * from candidate_vacancy where candidate_id = $1`, [nlCand.id]);
  check("reactie opgeslagen + fase gereageerd", nlLink.stage === "replied" && (await q(`select count(*)::int as n from messages where direction = 'in' and candidate_id = $1`, [nlCand.id]))[0].n === 1);
  const [noCand] = await q(`select * from candidates where linkedin_provider_id = $1`, [secondId]);
  check("'geen interesse' → afgemeld (regel 3)", noCand.status === "opted_out");
  check("afgemelde op niet-benaderen-lijst", (await q(`select count(*)::int as n from do_not_contact`))[0].n >= 1);
  await forceCheck("chats_check");
  await tick();
  check("reactie niet dubbel opgeslagen", (await q(`select count(*)::int as n from messages where direction = 'in'`))[0].n === 2);

  console.log("Dashboard en vacature:");
  await page.goto(`${APP}/`, { waitUntil: "networkidle" });
  check("dashboard: reactie zichtbaar", await seen(page.getByRole("link", { name: new RegExp(nlCand.full_name) })));
  check("dashboard: tekst van de reactie", await seen(page.getByText(/Ja, vertel me meer/)));
  check("dashboard: 'Geen interesse' gemarkeerd", await seen(page.getByText("Geen interesse", { exact: true })));
  await shot("2-dashboard-reacties");
  await page.goto(`${APP}/vacatures/${vac.id}`, { waitUntil: "networkidle" });
  check("vacature: alleen reacties standaard", (await page.locator("tbody tr").filter({ visible: true }).count()) === 2);
  check("vacature: 'Toon alle' knop", await seen(page.getByRole("link", { name: /Toon alle \(10\)/ })));
  await page.goto(`${APP}/kandidaten/${nlCand.id}`, { waitUntil: "networkidle" });
  check("kandidaat: tijdlijn met ontvangen bericht", await seen(page.getByText(/LinkedIn-bericht ontvangen/)));
  await shot("3-kandidaat-tijdlijn");

  console.log("Wijzigen na goedkeuring stopt de campagne:");
  await page.goto(`${APP}/vacatures/${vac.id}/automatisch`, { waitUntil: "networkidle" });
  await page.fill("#c-en", (await page.inputValue("#c-en")) + " Thanks!");
  await page.getByRole("button", { name: "Bewaar als concept" }).click();
  await seen(page.getByText("Opgeslagen."), 10000);
  const [afterEdit] = await q(`select status, approved_at from campaigns where id = $1`, [camp.id]);
  check("campagne terug naar concept", afterEdit.status === "draft" && afterEdit.approved_at === null, JSON.stringify(afterEdit));
  await q(`update settings set value = '20' where key = 'max_invites_per_day'`);
  await sleep(1200);
  const before = unipile.requests.filter((r) => r.path.endsWith("/relation-requests")).length;
  const idle = await tick();
  check("geen nieuwe uitnodigingen zonder goedkeuring", unipile.requests.filter((r) => r.path.endsWith("/relation-requests")).length === before, JSON.stringify(idle.body));

  console.log("Testknop:");
  await page.getByRole("button", { name: "Keur goed en start" }).click();
  await seen(page.getByText("Goedgekeurd en gestart."), 10000);
  await page.waitForLoadState("networkidle");
  await sleep(1200);
  await page.getByRole("button", { name: /Nu één stap uitvoeren/ }).click();
  check("testknop voert een stap uit", await seen(page.getByText(/Uitnodiging (met|zonder) tekst gestuurd aan|Wacht op pauze/), 10000));
  await shot("4-campagne-actief");

  console.log("Buiten werktijd:");
  await q(`update settings set value = '[]' where key = 'work_days'`);
  await forceCheck("chats_check");
  const closed = await tick();
  check("buiten werkdagen: pauze", closed.body.state === "paused", JSON.stringify(closed.body));
  const actions = (await q(`select action from activity_log`)).map((r) => r.action);
  for (const a of ["campaign_approved", "invite_sent", "invite_accepted", "message_sent", "reply_received", "opted_out"]) check(`gelogd: ${a}`, actions.includes(a));
} finally {
  await browser.close();
  try {
    process.kill(-app.pid, "SIGTERM");
  } catch {
    // al gestopt
  }
  supaServer.close();
  unipile.server.close();
}

console.log(`\n${failed ? `${failed} mislukt` : "Alles geslaagd"}`);
process.exit(failed ? 1 : 0);
