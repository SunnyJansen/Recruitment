/**
 * Test van de tijdelijke wachtwoordmodus (lib/auth/site-password.ts).
 * Gebruik:  npm run test:login
 */
process.env.SITE_PASSWORD = "Lassen-Is-Leuk-2026";
const { isPasswordMode, isValidSiteCookie, passwordMatches, siteToken } = await import("../lib/auth/site-password.ts");

let failed = 0;
const check = (name, cond) => (cond ? console.log(`  ✓ ${name}`) : (failed++, console.log(`  ✗ ${name}`)));

check("wachtwoordmodus aan als SITE_PASSWORD gezet is", isPasswordMode());
check("juist wachtwoord klopt", await passwordMatches("Lassen-Is-Leuk-2026"));
check("fout wachtwoord klopt niet", !(await passwordMatches("lassen-is-leuk-2026")));
check("leeg wachtwoord klopt niet", !(await passwordMatches("")));
const token = await siteToken();
check("cookie bevat niet het wachtwoord zelf", !token.includes("Lassen"));
check("geldige cookie wordt geaccepteerd", await isValidSiteCookie(token));
check("geknoeide cookie wordt geweigerd", !(await isValidSiteCookie(token.slice(0, -1) + "0")));
check("geen cookie wordt geweigerd", !(await isValidSiteCookie(undefined)));
process.env.SITE_PASSWORD = "Nieuw-Wachtwoord-2027";
check("na wachtwoordwissel is oude cookie ongeldig", !(await isValidSiteCookie(token)));
delete process.env.SITE_PASSWORD;
check("zonder SITE_PASSWORD staat de modus uit", !isPasswordMode());
check("zonder SITE_PASSWORD kan niemand met wachtwoord in", !(await passwordMatches("")));

console.log(`\n${failed ? `${failed} mislukt` : "Alles geslaagd"}`);
process.exit(failed ? 1 : 0);
