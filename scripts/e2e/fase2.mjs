/* eslint-disable @typescript-eslint/no-unused-expressions -- korte ok/fail-checks */
/**
 * End-to-end test van fase 2 (vacatures en kandidaten) in een echte browser,
 * tegen een nep-Supabase met een echte database (alle migraties en triggers).
 * Draait in de testmodus (teamwachtwoord).
 *
 * Gebruik: zie scripts/e2e/login.mjs (zelfde build).
 *   SCREENSHOTS=map  → bewaart schermafbeeldingen in die map.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";

import { chromium } from "playwright";

import { startFakeSupabase } from "./fake-supabase.mjs";

const APP_PORT = 3128;
const APP = `http://localhost:${APP_PORT}`;
const PASSWORD = "Lassen-Is-Leuk-2026";
const SHOTS = process.env.SCREENSHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

let failed = 0;
const check = (name, cond, info = "") => {
  cond ? console.log(`  ✓ ${name}`) : (failed++, console.log(`  ✗ ${name}\n      ${info}`));
};

if (await fetch(APP).then(() => true).catch(() => false)) {
  console.error(`Poort ${APP_PORT} is al in gebruik. Stop die server eerst.`);
  process.exit(1);
}

const { server, db } = await startFakeSupabase(54321);
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_e2e_test_key_0000",
  SITE_PASSWORD: PASSWORD,
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_e2e_service_key_9999",
};
const app = spawn("npx", ["next", "start", "-p", String(APP_PORT)], { env, stdio: "ignore", detached: true });
for (let i = 0; i < 60; i++) {
  if (await fetch(`${APP}/login`).then((r) => r.ok).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 500));
}

const executablePath = existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const shot = async (name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
/** Alleen zichtbare elementen tellen (Next.js houdt vorige pagina's verborgen in het geheugen). */
/** Wacht tot ~4 s tot het element zichtbaar is; false als het niet verschijnt. */
const seen = (locator) =>
  locator
    .filter({ visible: true })
    .first()
    .waitFor({ timeout: 4000 })
    .then(() => true)
    .catch(() => false);
const q = async (sql, params) => (await db.query(sql, params)).rows;

/** Formulier versturen en wachten tot de server klaar is (en eventueel doorstuurt). */
async function submitForm(buttonText) {
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST", { timeout: 15000 }),
    page.getByRole("button", { name: buttonText }).click(),
  ]);
  await page.waitForLoadState("networkidle");
}

try {
  // ------------------------------------------------------------------
  console.log("Inloggen (testmodus):");
  await page.goto(`${APP}/vacatures`, { waitUntil: "networkidle" });
  await page.fill("#password", PASSWORD);
  await submitForm("Log in");
  await page.waitForURL(`${APP}/vacatures`, { timeout: 15000 }).catch(() => {});
  await page.getByText("Nog geen vacatures").filter({ visible: true }).waitFor({ timeout: 10000 }).catch(() => {});
  check("op de vacaturepagina", page.url() === `${APP}/vacatures`, page.url());
  check("lege toestand", await seen(page.getByText("Nog geen vacatures")));

  // ------------------------------------------------------------------
  console.log("Vacature aanmaken:");
  await page.getByRole("link", { name: "Nieuwe vacature" }).click();
  await page.waitForURL(`${APP}/vacatures/nieuw`);
  await page.waitForLoadState("networkidle");
  await submitForm("Bewaar vacature");
  check("titel verplicht", await seen(page.getByText("Vul een functietitel in.")));

  await page.fill("#title", "TIG-lasser RVS");
  await page.fill("#location", "Venlo");
  await page.getByText("TIG (141)", { exact: true }).click();
  await page.getByText("RVS", { exact: true }).click();
  await page.fill("#certificaten", "NEN-EN-ISO 9606-1, VCA");
  await page.fill("#min_jaren_ervaring", "drie");
  await page.fill("#salaris", "€ 3.200 – € 3.800");
  await submitForm("Bewaar vacature");
  check("fout bij jaren ervaring", await seen(page.getByText("Vul een heel getal in tussen 0 en 50.")));
  check("ingevulde titel blijft staan na fout", (await page.inputValue("#title")) === "TIG-lasser RVS");
  check("aangevinkt lasproces blijft staan", await page.locator('input[name=lasprocessen][value="TIG (141)"]').isChecked());
  await shot("1-vacature-formulier-fout");

  await page.fill("#min_jaren_ervaring", "3");
  await submitForm("Bewaar vacature");
  await page.waitForURL(/\/vacatures\/[0-9a-f-]{36}$/, { timeout: 15000 }).catch(() => {});
  const vacancyUrl = page.url();
  check("doorgestuurd naar vacaturepagina", /\/vacatures\/[0-9a-f-]{36}$/.test(vacancyUrl), vacancyUrl);
  await page.getByRole("heading", { name: "Eisen" }).filter({ visible: true }).waitFor({ timeout: 10000 }).catch(() => {});
  check("titel getoond", await seen(page.getByRole("heading", { name: "TIG-lasser RVS" })));
  check("lasproces als chip", await seen(page.locator("dl").getByText("TIG (141)")));
  check("formulier is weg na opslaan", !(await seen(page.locator("#title"))));
  const [vac] = await q(`select * from vacancies`);
  check("eisen opgeslagen in database", vac?.requirements?.min_jaren_ervaring === 3 && vac.requirements.certificaten.length === 2, JSON.stringify(vac?.requirements));

  console.log("Vacature bewerken:");
  await page.getByRole("link", { name: "Bewerken" }).click();
  await page.waitForURL(/bewerken$/);
  check("bestaande waarden ingevuld", (await page.inputValue("#title")) === "TIG-lasser RVS" && (await page.inputValue("#min_jaren_ervaring")) === "3");
  await page.selectOption("#status", "paused");
  await submitForm("Bewaar wijzigingen");
  await page.waitForURL(vacancyUrl).catch(() => {});
  await page.getByRole("heading", { name: "Eisen" }).filter({ visible: true }).waitFor({ timeout: 10000 }).catch(() => {});
  check("status gewijzigd", await seen(page.getByText("Gepauzeerd").first()));
  await page.goto(`${APP}/vacatures/${vac.id}/bewerken`);
  await page.selectOption("#status", "open");
  await submitForm("Bewaar wijzigingen");
  await page.waitForURL(vacancyUrl).catch(() => {});

  // ------------------------------------------------------------------
  console.log("Kandidaten toevoegen:");
  async function addCandidate(fields) {
    await page.goto(`${APP}/kandidaten/nieuw`, { waitUntil: "networkidle" });
    for (const [id, value] of Object.entries(fields)) {
      if (id === "country") await page.selectOption("#country", value);
      else await page.fill(`#${id}`, value);
    }
    await submitForm("Bewaar kandidaat");
    // Wachten tot óf de kandidaatpagina óf een foutmelding er staat.
    await Promise.race([
      page.getByRole("heading", { name: "Tijdlijn" }).filter({ visible: true }).waitFor({ timeout: 15000 }),
      page.getByText(/staat al in de database|Controleer de rood/).filter({ visible: true }).waitFor({ timeout: 15000 }),
    ]).catch(() => {});
  }
  await addCandidate({ full_name: "Jan de Vries", linkedin_url: "linkedin.com/in/Jan-de-Vries", location: "Venlo", country: "NL", skills: "TIG, RVS, 6G", headline: "TIG-lasser" });
  check("Jan opgeslagen", /\/kandidaten\/[0-9a-f-]{36}$/.test(page.url()), page.url());
  const janUrl = page.url();
  const janId = janUrl.split("/").pop();
  check("taal Nederlands bij Nederland", await seen(page.getByText("Nederlands", { exact: true })));

  await addCandidate({ full_name: "Pieter van Wyk", location: "Secunda", country: "ZA", email: "Pieter@Example.co.za", experience: "Lasser – Sasol – 2019-2024" });
  const pieterUrl = page.url();
  check("taal Engels bij Zuid-Afrika", await seen(page.getByText("Engels", { exact: true })));
  const [pieter] = await q(`select * from candidates where full_name = 'Pieter van Wyk'`);
  check("e-mail in kleine letters, ervaring als lijst", pieter?.email === "pieter@example.co.za" && pieter.experience.length === 1, JSON.stringify(pieter));

  console.log("Dubbelen voorkomen:");
  await addCandidate({ full_name: "Jan Kopie", linkedin_url: "https://nl.linkedin.com/in/jan-de-vries/?trk=x" });
  check("zelfde LinkedIn-profiel geweigerd", await seen(page.getByText("Deze kandidaat staat al in de database.")));
  check("link naar bestaande kandidaat", (await page.getByRole("link", { name: "Open bestaande kandidaat" }).getAttribute("href")) === `/kandidaten/${janId}`);
  await shot("2-kandidaat-dubbel");
  await addCandidate({ full_name: "Pieter Kopie", email: "pieter@example.co.za" });
  check("zelfde e-mailadres geweigerd", await seen(page.getByText("Deze kandidaat staat al in de database.")));
  check("geen dubbelen in database", (await q(`select count(*)::int as n from candidates`))[0].n === 2);

  // ------------------------------------------------------------------
  console.log("Koppelen en fase wijzigen:");
  await page.goto(vacancyUrl, { waitUntil: "networkidle" });
  await page.selectOption("#link-" + vac.id, janId);
  await page.getByRole("button", { name: "Koppel" }).click();
  await page.getByRole("link", { name: "Jan de Vries" }).filter({ visible: true }).waitFor({ timeout: 10000 }).catch(() => {});
  check("Jan gekoppeld", await seen(page.getByRole("link", { name: "Jan de Vries" })));

  await page.getByLabel("Fase van Jan de Vries").selectOption("interview");
  for (let i = 0; i < 20; i++) {
    const [row] = await q(`select stage from candidate_vacancy where candidate_id = $1`, [janId]);
    if (row?.stage === "interview") break;
    await new Promise((r) => setTimeout(r, 250));
  }
  check("fase opgeslagen", (await q(`select stage from candidate_vacancy where candidate_id = $1`, [janId]))[0]?.stage === "interview");
  await page.waitForLoadState("networkidle");
  await shot("3-vacature-detail");

  await page.goto(pieterUrl, { waitUntil: "networkidle" });
  await page.selectOption(`#link-${pieter.id}`, vac.id);
  await page.getByRole("button", { name: "Koppel" }).click();
  await page.getByRole("link", { name: "TIG-lasser RVS" }).filter({ visible: true }).waitFor({ timeout: 10000 }).catch(() => {});
  check("Pieter gekoppeld vanaf kandidaatpagina", await seen(page.getByRole("link", { name: "TIG-lasser RVS" })));

  await page.goto(janUrl, { waitUntil: "networkidle" });
  check("tijdlijn: gekoppeld", await seen(page.getByText("Gekoppeld aan TIG-lasser RVS")));
  check("tijdlijn: fase gewijzigd", await seen(page.getByText("Nieuw → Gesprek")));
  check("tijdlijn: toegevoegd", await seen(page.getByText("Kandidaat toegevoegd")));
  await shot("4-kandidaat-detail");

  // ------------------------------------------------------------------
  console.log("Afmelden (AVG):");
  await page.getByRole("button", { name: "Afmelden…" }).click();
  check("eerst bevestiging gevraagd", await seen(page.getByText("Jan de Vries afmelden?")));
  await page.getByRole("button", { name: "Ja, afmelden" }).click();
  await page.getByText(/Afgemeld op/).filter({ visible: true }).waitFor({ timeout: 10000 }).catch(() => {});
  check("melding afgemeld", await seen(page.getByText(/Afgemeld op/)));
  check("tijdlijn: afgemeld", await seen(page.getByText("Afgemeld: nooit meer benaderen")));
  check("koppelen niet meer mogelijk", !(await seen(page.getByText("Koppel aan vacature"))));
  const [janLink] = await q(`select stage from candidate_vacancy where candidate_id = $1`, [janId]);
  check("database: fase → afgemeld", janLink?.stage === "opted_out", janLink?.stage);
  check("database: LinkedIn-link (als hash) op niet-benaderen-lijst", (await q(`select count(*)::int as n from do_not_contact where kind = 'linkedin_url'`))[0].n === 1);
  await shot("5-kandidaat-afgemeld");

  await page.goto(vacancyUrl, { waitUntil: "networkidle" });
  check("afgemelde kandidaat niet in koppel-lijst", (await page.locator(`#link-${vac.id} option[value="${janId}"]`).count()) === 0);
  check("fase-badge 'Afgemeld' op vacaturepagina", await seen(page.getByText("Afgemeld", { exact: true })));

  console.log("Niet-benaderen-lijst:");
  // Kandidaat verwijderd (bijv. later geanonimiseerd) en opnieuw ingevoerd → database herkent de persoon.
  await q(`delete from candidates where id = $1`, [janId]);
  await addCandidate({ full_name: "Jan de Vries", linkedin_url: "https://www.linkedin.com/in/jan-de-vries" });
  check("opnieuw ingevoerd → meteen afgemeld", await seen(page.getByText(/Afgemeld op/)));
  check("tijdlijn legt uit waarom", await seen(page.getByText("Stond op de niet-benaderen-lijst: direct afgemeld.")));

  console.log("Zoeken:");
  await page.goto(`${APP}/kandidaten?q=Pieter`, { waitUntil: "networkidle" });
  check("zoeken vindt Pieter", await seen(page.getByRole("link", { name: "Pieter van Wyk" })));
  check("zoeken toont Jan niet", !(await seen(page.getByRole("link", { name: "Jan de Vries" }))));
  await page.goto(`${APP}/kandidaten?q=(geen),*`, { waitUntil: "networkidle" });
  check("rare tekens in zoekterm geven geen fout", await seen(page.getByText(/Niets gevonden|Kandidaten/).first()));

  console.log("Overig:");
  await page.goto(`${APP}/kandidaten/00000000-0000-0000-0000-000000000000`, { waitUntil: "networkidle" });
  check("onbekende kandidaat → niet gevonden", await seen(page.getByText("Niet gevonden")));
  await page.goto(`${APP}/vacatures/geen-id`, { waitUntil: "networkidle" });
  check("ongeldig adres → niet gevonden", await seen(page.getByText("Niet gevonden")));
  await page.goto(`${APP}/`, { waitUntil: "networkidle" });
  await page.getByText("Databasecontrole").filter({ visible: true }).waitFor({ timeout: 10000 }).catch(() => {});
  check("dashboard telt 1 vacature en 2 kandidaten", (await page.innerText("main")).replace(/\s+/g, " ").includes("1 vacatures · 2 kandidaten"));
  const actions = (await q(`select action from activity_log order by id`)).map((r) => r.action);
  for (const a of ["vacancy_created", "vacancy_updated", "candidate_created", "linked_to_vacancy", "stage_changed", "opted_out"]) {
    check(`gelogd: ${a}`, actions.includes(a), actions.join(","));
  }
} finally {
  await browser.close();
  try {
    process.kill(-app.pid, "SIGTERM");
  } catch {
    // al gestopt
  }
  server.close();
}

console.log(`\n${failed ? `${failed} mislukt` : "Alles geslaagd"}`);
process.exit(failed ? 1 : 0);
