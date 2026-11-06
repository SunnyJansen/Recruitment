/**
 * Tijdelijke "wachtwoordmodus": zolang de env-var SITE_PASSWORD is ingevuld,
 * logt iedereen in met dat ene wachtwoord in plaats van met een inlogmail.
 * Bedoeld om het dashboard te testen; later SITE_PASSWORD weghalen en de
 * gewone login is terug.
 *
 * Na inloggen krijgt de browser een cookie met een afgeleide code (HMAC) van
 * het wachtwoord, nooit het wachtwoord zelf. Wijzig je het wachtwoord, dan is
 * iedereen automatisch uitgelogd.
 *
 * Werkt zowel in proxy.ts als op de server (Web Crypto).
 */

export const SITE_COOKIE = "cr8_site";
export const SITE_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 dagen

export function isPasswordMode() {
  return Boolean(process.env.SITE_PASSWORD);
}

/** Afgeleide code van een wachtwoord; komt in de cookie. */
export async function siteToken(password = process.env.SITE_PASSWORD ?? ""): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(`cr8las:${password}`), // nooit leeg, ook niet bij een leeg ingevuld veld
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("cr8las-site-v1"));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Vergelijkt twee codes zonder dat de duur iets verraadt. */
function sameString(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Klopt de cookie van deze browser met het huidige wachtwoord? */
export async function isValidSiteCookie(value: string | undefined) {
  if (!value || !isPasswordMode()) return false;
  return sameString(value, await siteToken());
}

/** Klopt het ingevulde wachtwoord? */
export async function passwordMatches(input: string) {
  if (!isPasswordMode()) return false;
  return sameString(await siteToken(input), await siteToken());
}
