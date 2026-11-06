/**
 * Hulpfuncties rond de inloglink uit de e-mail.
 *
 * Er zijn twee soorten links:
 * - `?code=…`        (standaard Supabase-link). Werkt alleen in dezelfde browser
 *                    waar de link is aangevraagd.
 * - `?token_hash=…`  (onze eigen mail-template, zie docs/INLOGMAIL.md). Werkt in
 *                    elke browser en op elk apparaat.
 */

export type LinkErrorKind = "browser" | "expired" | "link";

/**
 * Als Supabase de gebruiker op een willekeurige pagina laat landen (bijv. de
 * Site URL in plaats van /auth/callback), sturen we de code door naar de juiste
 * plek in plaats van hem weg te gooien. Geeft null als er niets te doen is.
 */
export function authRedirectFor(url: URL): URL | null {
  if (url.pathname.startsWith("/auth/")) return null;

  const next = url.pathname === "/" || url.pathname === "/login" ? "/" : url.pathname;

  const tokenHash = url.searchParams.get("token_hash");
  if (tokenHash) {
    const target = new URL("/auth/confirm", url.origin);
    target.searchParams.set("token_hash", tokenHash);
    target.searchParams.set("type", url.searchParams.get("type") ?? "email");
    target.searchParams.set("next", next);
    return target;
  }

  const code = url.searchParams.get("code");
  if (code) {
    const target = new URL("/auth/callback", url.origin);
    target.searchParams.set("code", code);
    target.searchParams.set("next", next);
    return target;
  }

  // Supabase meldt een mislukte link soms in de URL (?error_code=otp_expired).
  const errorCode = url.searchParams.get("error_code");
  if (errorCode && url.pathname !== "/login") {
    const target = new URL("/login", url.origin);
    target.searchParams.set("error", linkErrorKind({ code: errorCode }));
    return target;
  }

  return null;
}

/** Bepaalt welke uitleg de gebruiker krijgt als een inloglink niet werkt. */
export function linkErrorKind(error: { code?: string | null; message?: string | null }): LinkErrorKind {
  const code = error.code ?? "";
  const message = error.message ?? "";
  if (code === "pkce_code_verifier_not_found" || code === "bad_code_verifier" || /code verifier/i.test(message)) {
    return "browser";
  }
  if (code === "otp_expired" || code === "flow_state_expired" || code === "flow_state_not_found" || /expired|invalid/i.test(message)) {
    return "expired";
  }
  return "link";
}

/** Alleen interne paden toestaan als doorstuuradres (geen andere websites). */
export function safeNext(value: string | null | undefined): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

/** Nederlandse uitleg per soort fout, voor het inlogscherm. */
export const LINK_ERROR_MESSAGES: Record<LinkErrorKind, string> = {
  browser:
    "De link is in een andere browser geopend dan waar je hem aanvroeg. Vraag een nieuwe link aan en open hem in dezelfde browser (kopieer de link eventueel naar die browser).",
  expired:
    "De inloglink is verlopen of al gebruikt. Soms opent een virusscanner in je mailprogramma de link al. Vraag een nieuwe aan.",
  link: "Inloggen met deze link is mislukt. Vraag een nieuwe link aan.",
};

/** Leest inloggegevens of een fout uit het #-deel van het adres. */
export function readLoginHash(hash: string) {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  return {
    accessToken: params.get("access_token"),
    refreshToken: params.get("refresh_token"),
    errorCode: params.get("error_code") ?? params.get("error"),
    errorDescription: params.get("error_description"),
  };
}
