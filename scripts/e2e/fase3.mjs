/* eslint-disable @typescript-eslint/no-unused-expressions -- korte ok/fail-checks */
/**
 * End-to-end test van fase 3 (LinkedIn zoeken & importeren) in een echte
 * browser, tegen een nep-Supabase (echte database + migraties) en een
 * nep-Unipile (zelfde API als de documentatie). Testmodus (teamwachtwoord).
 *
 * Gebruik: zie scripts/e2e/login.mjs (zelfde build).
 *   SCREENSHOTS=map  → bewaart schermafbeeldingen.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";

import { chromium } from "playwright";

import { startFakeSupabase } from "./fake-supabase.mjs";
import { FAKE_ACCOUNT, FAKE_KEY, FAKE_PEOPLE, MISSING_PROFILE_ID, startFakeUnipile } from "./fake-unipile.mjs";

const APP_PORT = 3129;
const APP = `http://localhost:${APP_PORT}`;
const PASSWORD = "Lassen-Is-Leuk-2026";
const SHOTS = process.env.SCREENSHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

let failed = 0;
const check = (name, cond, info = "") => {
  cond ? console.log(`  ✓ ${name}`) : (failed++, console.log(`  ✗ ${name}\n      ${info}`));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dncHash = (v) => createHash("sha256").update(v.trim().toLowerCase()).digest("hex");

if (await fetch(APP).then(() => true).catch(() => false)) {
  console.error(`Poort ${APP_PORT} is al in gebruik. Stop die server eerst.`);
  process.exit(1);
}

const { server: supaServer, db } = await startFakeSupabase(54321);
const unipile = await startFakeUnipile(54400);
const q = async (sql, params) => (await db.query(sql, params)).rows;

const baseEnv = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_e2e_test_key_0000",
  SITE_PASSWORD: PASSWORD,
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_e2e_service_key_9999",
};
for (const k of ["UNIPILE_DSN", "UNIPILE_API_KEY", "UNIPILE_ACCOUNT_ID"]) delete baseEnv[k];

async function startApp(extraEnv) {
  const proc = spawn("npx", ["next", "start", "-p", String(APP_PORT)], { env: { ...baseEnv, ...extraEnv }, stdio: "ignore", detached: true });
  for (let i = 0; i < 60; i++) {
    if (await fetch(`${APP}/login`).then((r) => r.ok).catch(() => false)) break;
    await sleep(500);
  }
  return () => {
    try {
      process.kill(-proc.pid, "SIGTERM");
    } catch {
      // al gestopt
    }
  };
}

const executablePath = existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const shot = async (name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
const seen = (locator, timeout = 4000) =>
  locator.filter({ visible: true }).first().waitFor({ timeout }).then(() => true).catch(() => false);

async function login() {
  await page.goto(`${APP}/login`, { waitUntil: "networkidle" });
  if (await seen(page.locator("#password"), 2000)) {
    await page.fill("#password", PASSWORD);
    await Promise.all([page.waitForURL(`${APP}/`, { timeout: 15000 }), page.getByRole("button", { name: "Log in" }).click()]);
  }
}

// Testgegevens: vacature, een bestaande kandidaat en een afgemelde persoon.
const [vac] = await q(
  `insert into vacancies (title, location, requirements) values ('TIG-lasser RVS', 'Limburg', '{"lasprocessen":["TIG (141)"],"materialen":["RVS"]}') returning id`,
);
const existingPerson = FAKE_PEOPLE[1]; // Kees: staat al in de database (handmatig, via link)
const [existing] = await q(`insert into candidates (full_name, linkedin_url) values ($1, $2) returning id`, [
  existingPerson.name,
  `https://www.linkedin.com/in/${existingPerson.public_identifier}`,
]);
const optedOutPerson = FAKE_PEOPLE[2]; // Piet: op de niet-benaderen-lijst
await q(`insert into do_not_contact (hash, kind) values ($1, 'linkedin')`, [dncHash(optedOutPerson.id)]);
// Snelle test: korte pauzes, altijd werktijd, daglimiet 4 profielbezoeken.
await q(`update settings set value = '1' where key = 'delay_min_seconds'`);
await q(`update settings set value = '2' where key = 'delay_max_seconds'`);
await q(`update settings set value = '[1,2,3,4,5,6,7]' where key = 'work_days'`);
await q(`update settings set value = '{"start":"00:00","end":"23:59"}' where key = 'work_hours'`);
await q(`update settings set value = 'false' where key = 'skip_dutch_holidays'`);
await q(`update settings set value = '4' where key = 'max_profile_views_per_day'`);

let stopApp;
try {
  // ------------------------------------------------------------------
  console.log("Zonder Unipile-sleutels:");
  stopApp = await startApp({});
  await login();
  await page.goto(`${APP}/vacatures/${vac.id}/zoeken`, { waitUntil: "networkidle" });
  check("uitleg 'LinkedIn nog niet gekoppeld'", await seen(page.getByText("LinkedIn nog niet gekoppeld")));
  check("noemt de ontbrekende sleutels", await seen(page.getByText("UNIPILE_DSN")));
  stopApp();
  await sleep(1000);

  // ------------------------------------------------------------------
  console.log("Zoeken:");
  stopApp = await startApp({ UNIPILE_DSN: "http://localhost:54400", UNIPILE_API_KEY: FAKE_KEY, UNIPILE_ACCOUNT_ID: FAKE_ACCOUNT, UNIPILE_LINKEDIN_API: "classic" });
  await login();
  await page.goto(`${APP}/vacatures/${vac.id}`, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "Zoek op LinkedIn" }).click();
  await page.waitForURL(`${APP}/vacatures/${vac.id}/zoeken`);
  await page.waitForLoadState("networkidle");
  check("trefwoorden voorgesteld uit vacature", (await page.inputValue("#keywords")) === "TIG RVS", await page.inputValue("#keywords"));
  check("functietitel voorgesteld", (await page.inputValue("#title")) === "TIG-lasser RVS");

  await page.fill("#location", "Limburg");
  await page.getByRole("button", { name: "Zoek locatie" }).click();
  check("locaties gevonden", await seen(page.getByText("Limburg, Nederland")));
  await page.getByRole("group", { name: "Gevonden locaties" }).getByText("Limburg, Nederland", { exact: true }).click();

  await page.getByRole("button", { name: "Zoek op LinkedIn" }).click();
  await seen(page.getByRole("heading", { name: "Resultaten" }), 15000);
  const searchReq = unipile.requests.find((r) => r.path === "/api/v1/linkedin/search");
  check("Unipile: api classic + people", searchReq?.body?.api === "classic" && searchReq?.body?.category === "people", JSON.stringify(searchReq?.body));
  check("Unipile: locatie-ID meegestuurd", JSON.stringify(searchReq?.body?.location) === '["90009706"]', JSON.stringify(searchReq?.body));
  check("Unipile: functietitel als advanced_keywords", searchReq?.body?.advanced_keywords?.title === "TIG-lasser RVS");
  check("Unipile: max. 10 per pagina (classic)", searchReq?.query?.limit === "10", JSON.stringify(searchReq?.query));
  check("Unipile: API-key en account meegestuurd", searchReq?.apiKey === FAKE_KEY && searchReq?.query?.account_id === FAKE_ACCOUNT);
  check("10 resultaten getoond", (await page.locator("tbody tr").filter({ visible: true }).count()) === 10);
  check("bestaande kandidaat gemarkeerd", await seen(page.getByRole("row", { name: new RegExp(existingPerson.name) }).getByText("Al in database")));
  check("afgemelde persoon gemarkeerd", await seen(page.getByRole("row", { name: new RegExp(optedOutPerson.name) }).getByText("Afgemeld")));
  check("bestaande/afgemelde niet selecteerbaar", await page.getByLabel(`Selecteer ${optedOutPerson.name}`).isDisabled());

  await page.getByRole("button", { name: "Meer resultaten" }).click();
  await seen(page.getByText(FAKE_PEOPLE[12].name), 10000);
  check("volgende pagina met cursor", unipile.requests.filter((r) => r.path === "/api/v1/linkedin/search" && r.query.cursor).length === 1);
  check("alle 13 resultaten getoond", (await page.locator("tbody tr").filter({ visible: true }).count()) === 13);
  check("zoekopdracht bewaard", (await q(`select count(*)::int as n from searches where vacancy_id = $1`, [vac.id]))[0].n === 1);
  check("zoekresultaten geteld", (await q(`select sum(amount)::int as n from linkedin_actions where kind = 'search'`))[0].n === 13);
  await shot("1-zoekresultaten");

  // ------------------------------------------------------------------
  console.log("Importeren (wachtrij, pauzes, daglimiet):");
  const toImport = [FAKE_PEOPLE[0], FAKE_PEOPLE[3], FAKE_PEOPLE[5], FAKE_PEOPLE[12], FAKE_PEOPLE[7]]; // incl. 404-profiel
  for (const p of toImport) await page.getByLabel(`Selecteer ${p.name}`).check();
  check("selectie geteld", await seen(page.getByRole("button", { name: "Importeer geselecteerde (5)" })));
  await page.getByRole("button", { name: "Importeer geselecteerde (5)" }).click();
  await page.waitForURL(`${APP}/vacatures/${vac.id}/import`, { timeout: 15000 }).catch(() => {});
  check("naar importpagina", page.url() === `${APP}/vacatures/${vac.id}/import`, page.url());
  check("5 in de wachtrij", (await q(`select count(*)::int as n from import_queue`))[0].n === 5);

  await seen(page.getByText(/Daglimiet bereikt/), 60000);
  check("stopt bij daglimiet (4 profielbezoeken)", await seen(page.getByText(/Daglimiet bereikt: 4 van 4/)));
  await shot("2-import-daglimiet");
  const views = unipile.requests.filter((r) => /^\/api\/v1\/users\//.test(r.path));
  check("precies 4 profielen opgehaald", views.length === 4, String(views.length));
  check("profielbezoek zonder melding (notify=false)", views.every((r) => r.query.notify === "false"));
  check("alleen preview-secties", views.every((r) => r.query.linkedin_sections === "*_preview"));
  const gaps = views.slice(1).map((r, i) => r.at - views[i].at);
  check("nooit tegelijk: pauze tussen bezoeken", gaps.every((g) => g >= 900), JSON.stringify(gaps));

  const imported = await q(`select * from candidates where source = 'linkedin_import' order by created_at`);
  // Volgorde = volgorde van de zoekresultaten; het verdwenen profiel (nr. 13) is de vijfde en valt na de daglimiet.
  check("4 kandidaten geïmporteerd tot de daglimiet", imported.length === 4, imported.map((c) => c.full_name).join(","));
  check("e-mail/telefoon NIET overgenomen", imported.every((c) => c.email === null && c.phone === null));
  const thabo = imported.find((c) => c.full_name === "Thabo Nkosi");
  const jan = imported.find((c) => c.full_name === "Jan Bakker");
  check("Zuid-Afrikaan → Engels, Nederlander → Nederlands", thabo?.language === "en" && thabo?.country === "ZA" && jan?.language === "nl" && jan?.country === "NL");
  check("LinkedIn-id, link, vaardigheden en ervaring opgeslagen", jan?.linkedin_provider_id === "ACoAAFake01" && jan?.linkedin_url === "https://www.linkedin.com/in/jan-bakker" && jan?.skills.includes("TIG") && jan?.experience.length === 2);
  check("gekoppeld aan vacature (fase nieuw)", (await q(`select count(*)::int as n from candidate_vacancy where vacancy_id = $1 and stage = 'new'`, [vac.id]))[0].n === 4);
  check("vijfde wacht nog in de wachtrij", (await q(`select status from import_queue where provider_id = $1`, [MISSING_PROFILE_ID]))[0]?.status === "pending");

  console.log("Verder na verhogen limiet:");
  await q(`update settings set value = '10' where key = 'max_profile_views_per_day'`);
  await page.getByRole("button", { name: "Opnieuw proberen" }).click();
  check("import klaar", await seen(page.getByText("Klaar."), 30000));
  check("geen extra kandidaat voor verdwenen profiel", (await q(`select count(*)::int as n from candidates where source = 'linkedin_import'`))[0].n === 4);
  const missing = (await q(`select * from import_queue where provider_id = $1`, [MISSING_PROFILE_ID]))[0];
  check("verdwenen profiel → mislukt met uitleg", missing?.status === "failed" && /Niet gevonden/.test(missing?.result ?? ""), JSON.stringify(missing));
  check("pagina toont 'Mislukt'", await seen(page.getByRole("row", { name: /Verdwenen Profiel/ }).getByText("Mislukt")));
  await shot("3-import-klaar");

  console.log("Geen dubbelen bij tweede import:");
  await q(`insert into import_queue (vacancy_id, provider_id, name) values ($1, 'ACoAAFake01', 'Jan Bakker'), ($1, $2, $3)`, [
    vac.id,
    existingPerson.id,
    existingPerson.name,
  ]);
  await page.goto(`${APP}/vacatures/${vac.id}/import`, { waitUntil: "networkidle" });
  await seen(page.getByText("Klaar."), 30000);
  check("Jan niet dubbel", (await q(`select count(*)::int as n from candidates where full_name = 'Jan Bakker'`))[0].n === 1);
  check("handmatige kandidaat herkend via link (geen dubbel)", (await q(`select count(*)::int as n from candidates where full_name = $1`, [existingPerson.name]))[0].n === 1);
  check("bestaande kandidaat krijgt LinkedIn-id erbij", (await q(`select linkedin_provider_id from candidates where id = $1`, [existing.id]))[0].linkedin_provider_id === existingPerson.id);
  check("resultaat 'Stond al in de database'", (await q(`select count(*)::int as n from import_queue where result = 'Stond al in de database'`))[0].n === 2);

  console.log("Zoekresultaten na import:");
  await page.goto(`${APP}/vacatures/${vac.id}/zoeken`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Zoek op LinkedIn" }).click();
  await seen(page.getByRole("heading", { name: "Resultaten" }), 15000);
  check("geïmporteerde kandidaat nu 'Al in database'", await seen(page.getByRole("row", { name: /Jan Bakker/ }).getByText("Al in database")));

  console.log("Werktijden en fouten:");
  await q(`update settings set value = '[]' where key = 'work_days'`);
  await page.getByRole("button", { name: "Zoek op LinkedIn" }).click();
  check("zoeken buiten werkdagen geweigerd", await seen(page.getByText(/alleen op werkdagen/)));
  await q(`insert into import_queue (vacancy_id, provider_id, name) values ($1, 'ACoAAFake11', 'Tom Vos')`, [vac.id]);
  await page.goto(`${APP}/vacatures/${vac.id}/import`, { waitUntil: "networkidle" });
  check("import pauzeert buiten werkdagen", await seen(page.getByText(/alleen op werkdagen/), 15000));
  await q(`update settings set value = '[1,2,3,4,5,6,7]' where key = 'work_days'`);
  unipile.state.mode = "disconnected";
  await page.goto(`${APP}/vacatures/${vac.id}/zoeken`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Zoek op LinkedIn" }).click();
  check("losgekoppeld account → duidelijke melding", await seen(page.getByText(/losgekoppeld van Unipile/), 10000));
  unipile.state.mode = "ok";

  console.log("Vacaturepagina en logboek:");
  await page.goto(`${APP}/vacatures/${vac.id}`, { waitUntil: "networkidle" });
  check("melding: nog profielen in wachtrij", await seen(page.getByText(/nog 1 LinkedIn-profielen in de importwachtrij/)));
  check("geïmporteerde kandidaten in de lijst", await seen(page.getByRole("link", { name: "Thabo Nkosi" })));
  const actions = (await q(`select action, details from activity_log`)).map((r) => r.action);
  for (const a of ["linkedin_search", "import_queued", "candidate_created", "linked_to_vacancy"]) check(`gelogd: ${a}`, actions.includes(a));
  await page.goto(`${APP}/kandidaten/${thabo.id}`, { waitUntil: "networkidle" });
  check("kandidaatpagina: bron LinkedIn", await seen(page.getByText("LinkedIn", { exact: true })));
  await shot("4-kandidaat-geimporteerd");
} finally {
  await browser.close();
  stopApp?.();
  supaServer.close();
  unipile.server.close();
}

console.log(`\n${failed ? `${failed} mislukt` : "Alles geslaagd"}`);
process.exit(failed ? 1 : 0);
