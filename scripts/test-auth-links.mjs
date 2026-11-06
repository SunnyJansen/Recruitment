/**
 * Test van het doorsturen van inloglinks (lib/auth/auth-links.ts).
 * Gebruik:  npm run test:login
 */
import { authRedirectFor, linkErrorKind, readLoginHash, safeNext } from "../lib/auth/auth-links.ts";

const base = "https://recruitment-test.vercel.app";
let failed = 0;
function check(name, actual, expected) {
  if (actual === expected) console.log(`  ✓ ${name}`);
  else {
    failed++;
    console.log(`  ✗ ${name}\n      kreeg: ${actual}\n      wilde: ${expected}`);
  }
}
const r = (path) => authRedirectFor(new URL(path, base))?.toString() ?? null;

check("code op de homepage → /auth/callback", r("/?code=abc"), `${base}/auth/callback?code=abc&next=%2F`);
check("code op het inlogscherm → /auth/callback", r("/login?code=abc"), `${base}/auth/callback?code=abc&next=%2F`);
check("code op andere pagina → terug naar die pagina", r("/kandidaten?code=abc"), `${base}/auth/callback?code=abc&next=%2Fkandidaten`);
check("token_hash → /auth/confirm", r("/?token_hash=xyz&type=email"), `${base}/auth/confirm?token_hash=xyz&type=email&next=%2F`);
check("al op /auth/callback → niets doen", r("/auth/callback?code=abc"), null);
check("gewone pagina → niets doen", r("/vacatures"), null);
check("Supabase-fout in adres → inlogscherm met uitleg", r("/?error=access_denied&error_code=otp_expired"), `${base}/login?error=expired`);
check("andere browser herkend", linkErrorKind({ code: "pkce_code_verifier_not_found" }), "browser");
check("verlopen link herkend", linkErrorKind({ code: "otp_expired" }), "expired");
check("onbekend → algemeen", linkErrorKind({ code: "iets_anders" }), "link");
check("doorsturen naar andere website geblokkeerd", safeNext("//evil.example"), "/");
check("intern pad toegestaan", safeNext("/berichten"), "/berichten");
const h = readLoginHash("#access_token=AT&expires_in=3600&refresh_token=RT&token_type=bearer&type=magiclink");
check("inloggegevens uit # gelezen (access)", h.accessToken, "AT");
check("inloggegevens uit # gelezen (refresh)", h.refreshToken, "RT");
check("fout uit # gelezen", readLoginHash("#error=access_denied&error_code=otp_expired").errorCode, "otp_expired");

console.log(`\n${failed ? "Er zijn fouten" : "Alles geslaagd"} (${failed} mislukt)`);
process.exit(failed ? 1 : 0);
