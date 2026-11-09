/* eslint-disable @typescript-eslint/no-unused-expressions -- korte ok/fail-checks */
/**
 * End-to-end test van het inloggen, met een nep-Supabase en een echte browser.
 *
 * Deel 1 — inlogmail: de link moet ook in een ANDERE browser werken.
 * Deel 2 — tijdelijke wachtwoordmodus (SITE_PASSWORD).
 *
 * Gebruik (de app moet gebouwd zijn met de nep-Supabase als adres):
 *   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 \
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_e2e_test_key_0000 npm run build
 *   npm run test:e2e
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

import { chromium } from "playwright";

import { startFakeSupabase } from "./fake-supabase.mjs";

const MOCK_PORT = 54321;
const BASE_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: `http://localhost:${MOCK_PORT}`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_e2e_test_key_0000",
};
const SITE_PASSWORD = "Lassen-Is-Leuk-2026";
const SERVICE_KEY = "sb_secret_e2e_service_key_9999";

let failed = 0;
const check = (name, cond, info = "") => {
  cond ? console.log(`  ✓ ${name}`) : (failed++, console.log(`  ✗ ${name}\n      ${info}`));
};

/** Start de gebouwde app op een poort, met extra env-vars. */
async function startApp(port, extraEnv = {}) {
  const url = `http://localhost:${port}`;
  // Er mag niet al een (oude) server op deze poort draaien, anders test je de verkeerde versie.
  if (await fetch(url).then(() => true).catch(() => false)) {
    console.error(`Poort ${port} is al in gebruik. Stop die server eerst.`);
    process.exit(1);
  }
  const env = { ...process.env, ...BASE_ENV, ...extraEnv };
  if (!extraEnv.SITE_PASSWORD) delete env.SITE_PASSWORD;
  // detached: eigen procesgroep, zodat we aan het eind ook de Next.js-server zelf stoppen.
  const proc = spawn("npx", ["next", "start", "-p", String(port)], { env, stdio: "ignore", detached: true });
  for (let i = 0; i < 60; i++) {
    if (await fetch(`${url}/login`).then((r) => r.ok).catch(() => false)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const stop = () => {
    try {
      process.kill(-proc.pid, "SIGTERM");
    } catch {
      // al gestopt
    }
  };
  return { url, stop };
}

const { server, requests } = await startFakeSupabase(MOCK_PORT);
const executablePath = existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const apps = [];

try {
  // ------------------------------------------------------------------
  console.log("DEEL 1 — inlogmail");
  const mailApp = await startApp(3126);
  apps.push(mailApp);
  const APP = mailApp.url;

  // Nep-inloggegevens zoals Supabase ze achter de # in de link zet.
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const jwt = [
    b64({ alg: "HS256", typ: "JWT" }),
    b64({ sub: "11111111-1111-1111-1111-111111111111", aud: "authenticated", role: "authenticated", email: "sunny@cr8las.nl", exp: now + 3600, iat: now, session_id: "s1" }),
    "sig",
  ].join(".");
  const hash = `#access_token=${jwt}&expires_at=${now + 3600}&expires_in=3600&refresh_token=rt123&token_type=bearer&type=magiclink`;

  console.log("Inloglink aanvragen (browser A):");
  const a = await browser.newPage();
  await a.goto(`${APP}/login`, { waitUntil: "networkidle" });
  await a.fill("#email", "sunny@cr8las.nl");
  await a.click("button[type=submit]");
  await a.waitForSelector("text=Check je mail", { timeout: 15000 }).catch(() => {});
  const otp = requests.find((r) => r.method === "POST" && r.url.startsWith("/auth/v1/otp"));
  const otpBody = JSON.parse(otp?.body || "{}");
  const redirectTo = new URL(otp?.url ?? "/", "http://x").searchParams.get("redirect_to");
  check("link niet aan één browser gebonden (geen PKCE)", otp && !otpBody.code_challenge, JSON.stringify(otpBody));
  check("alleen bestaande gebruikers", otpBody.create_user === false);
  check("link wijst naar /auth/complete", redirectTo === `${APP}/auth/complete?next=%2F`, redirectTo);

  console.log("Link openen in een andere, schone browser (B):");
  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await b.goto(`${redirectTo}${hash}`);
  await b.waitForSelector("text=Databasecontrole", { timeout: 15000 }).catch(() => {});
  check("komt op het dashboard", b.url() === `${APP}/`, b.url());
  check("gebruiker in de kopbalk", await b.isVisible("text=sunny@cr8las.nl"));
  check("inloggegevens uit de adresbalk gehaald", !b.url().includes("access_token"));
  const cookies = await ctxB.cookies();
  check("sessie-cookie gezet", cookies.some((c) => c.name.includes("auth-token")), cookies.map((c) => c.name).join(","));
  check(
    "login vastgelegd in activity_log",
    requests.some((r) => r.method === "POST" && r.url.startsWith("/rest/v1/activity_log")),
  );
  await b.goto(`${APP}/instellingen`);
  await b.waitForSelector("text=max_invites_per_day", { timeout: 10000 }).catch(() => {});
  check("blijft ingelogd op andere pagina", b.url() === `${APP}/instellingen` && (await b.isVisible("text=max_invites_per_day")), b.url());

  console.log("Link die op de Site URL landt (browser C):");
  const c = await (await browser.newContext()).newPage();
  await c.goto(`${APP}/${hash}`);
  await c.waitForSelector("text=Databasecontrole", { timeout: 15000 }).catch(() => {});
  check("komt alsnog op het dashboard", c.url() === `${APP}/`, c.url());

  console.log("Verlopen link (browser D):");
  const d = await (await browser.newContext()).newPage();
  await d.goto(`${APP}/auth/complete?next=%2F#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`);
  await d.waitForSelector("text=verlopen of al gebruikt", { timeout: 10000 }).catch(() => {});
  check("duidelijke melding", await d.isVisible("text=verlopen of al gebruikt"));

  console.log("Zonder login (browser E):");
  const e = await (await browser.newContext()).newPage();
  await e.goto(`${APP}/kandidaten`);
  check("naar het inlogscherm", e.url().startsWith(`${APP}/login`), e.url());

  mailApp.stop();

  // ------------------------------------------------------------------
  console.log("\nDEEL 2 — tijdelijke wachtwoordmodus");
  const pwApp = await startApp(3127, { SITE_PASSWORD, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY });
  apps.push(pwApp);
  const PW = pwApp.url;
  requests.length = 0;

  const ctxP = await browser.newContext();
  const p = await ctxP.newPage();
  const browserApiKeys = [];
  p.on("request", (r) => {
    const key = r.headers().apikey;
    if (key) browserApiKeys.push(key);
  });

  await p.goto(`${PW}/kandidaten`, { waitUntil: "networkidle" });
  check("zonder wachtwoord naar het inlogscherm", p.url() === `${PW}/login?next=%2Fkandidaten`, p.url());
  check("wachtwoordveld zichtbaar, geen e-mailveld", (await p.isVisible("#password")) && !(await p.isVisible("#email")));

  // Klikken en wachten tot de server geantwoord heeft (React maakt het veld daarna leeg).
  const submit = () =>
    Promise.all([p.waitForResponse((r) => r.request().method() === "POST"), p.click("button[type=submit]")]);

  await p.fill("#password", "fout-wachtwoord");
  await submit();
  await p.waitForSelector("text=klopt niet", { timeout: 10000 }).catch(() => {});
  check("fout wachtwoord geweigerd", await p.isVisible("text=klopt niet"));

  await p.fill("#password", "");
  await p.evaluate(() => document.querySelector("#password").removeAttribute("required"));
  await submit();
  await p.waitForSelector("text=klopt niet", { timeout: 10000 }).catch(() => {});
  check("leeg wachtwoord geeft nette melding (geen crash)", await p.isVisible("text=klopt niet"));

  await p.fill("#password", SITE_PASSWORD);
  await submit();
  await p.waitForURL(`${PW}/kandidaten`, { timeout: 15000 }).catch(() => {});
  check("juist wachtwoord → terug naar gevraagde pagina", p.url() === `${PW}/kandidaten`, p.url());

  await p.goto(`${PW}/`);
  await p.waitForSelector("text=Databasecontrole", { timeout: 15000 }).catch(() => {});
  check("dashboard werkt", await p.isVisible("text=Alles in orde"));
  check("kopbalk toont testmodus", await p.isVisible("text=Testmodus"));

  const siteCookie = (await ctxP.cookies()).find((ck) => ck.name === "cr8_site");
  check("cookie gezet en niet leesbaar voor scripts (httpOnly)", siteCookie?.httpOnly === true, JSON.stringify(siteCookie));
  check("cookie bevat niet het wachtwoord", siteCookie && !siteCookie.value.includes(SITE_PASSWORD));
  check("server gebruikt de service-key", requests.some((r) => r.url.startsWith("/rest/v1/") && r.apikey === SERVICE_KEY));
  check("service-key komt nooit in de browser", !browserApiKeys.includes(SERVICE_KEY) && !(await p.content()).includes(SERVICE_KEY));
  check(
    "inlogpoging en login gelogd",
    requests.filter((r) => r.method === "POST" && r.url.startsWith("/rest/v1/activity_log")).length >= 2,
  );

  await p.click("button[aria-label=Uitloggen]");
  await p.waitForURL(`${PW}/login`, { timeout: 10000 }).catch(() => {});
  await p.goto(`${PW}/`);
  check("na uitloggen weer naar inlogscherm", p.url().startsWith(`${PW}/login`), p.url());

  const q = await (await browser.newContext()).newPage();
  await q.context().addCookies([{ name: "cr8_site", value: "nep", url: PW }]);
  await q.goto(`${PW}/`);
  check("nagemaakte cookie wordt geweigerd", q.url().startsWith(`${PW}/login`), q.url());
} finally {
  await browser.close();
  apps.forEach((app) => app.stop());
  server.close();
}

console.log(`\n${failed ? `${failed} mislukt` : "Alles geslaagd"}`);
process.exit(failed ? 1 : 0);
