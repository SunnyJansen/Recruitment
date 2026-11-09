import "server-only";

/**
 * Unipile-client voor API v2 (alleen op de server: de API-key mag nooit naar
 * de browser). Adres, inloggen en foutcodes geverifieerd in docs/UNIPILE.md.
 *
 * Alle routes: https://api.unipile.com/v2/{account_id}/...
 */

export type UnipileConfig = {
  baseUrl: string;
  apiKey: string;
  accountId: string;
};

export const DEFAULT_UNIPILE_URL = "https://api.unipile.com";

/**
 * Leest de Unipile-instellingen uit de env-vars. Geeft ontbrekende namen en
 * eventuele fouten (bijv. verkeerd account-ID) terug.
 */
export function getUnipileConfig(): { config: UnipileConfig | null; missing: string[]; problem?: string } {
  const apiKey = (process.env.UNIPILE_API_KEY ?? "").trim();
  const accountId = (process.env.UNIPILE_ACCOUNT_ID ?? "").trim();
  const missing = [!apiKey && "UNIPILE_API_KEY", !accountId && "UNIPILE_ACCOUNT_ID"].filter(Boolean) as string[];
  if (missing.length) return { config: null, missing };
  if (!/^acc_/.test(accountId)) {
    return {
      config: null,
      missing: [],
      problem:
        "UNIPILE_ACCOUNT_ID moet beginnen met acc_ (Unipile-dashboard → Accounts → je LinkedIn-account). Pas het aan in Vercel en klik Redeploy.",
    };
  }
  // Optioneel adres (alleen voor tests of een afwijkende server). Een ingevuld
  // "/v2" of oud v1-pad halen we eraf, zodat het altijd goed gaat.
  const raw = (process.env.UNIPILE_DSN ?? "").trim() || DEFAULT_UNIPILE_URL;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const baseUrl = withScheme.replace(/\/+$/, "").replace(/\/(v2|api\/v1)$/i, "");
  return { config: { baseUrl, apiKey, accountId }, missing: [] };
}

/** Korte uitleg wat er mist of fout staat, voor op het scherm. */
export function unipileSetupProblem(): string | null {
  const { missing, problem } = getUnipileConfig();
  if (problem) return problem;
  if (missing.length) return `Unipile is nog niet ingesteld. Ontbrekend in Vercel: ${missing.join(", ")}.`;
  return null;
}

export class UnipileError extends Error {
  constructor(
    message: string,
    public status: number,
    public type: string | null,
    public retryAfter: number | null = null,
  ) {
    super(message);
  }

  /** Tijdelijk probleem: later opnieuw proberen heeft zin. */
  get temporary() {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

/** Nederlandse uitleg per fouttype (docs/UNIPILE.md, "Foutmeldingen v2"). */
export function explainUnipileError(status: number, type: string | null, detail?: string): string {
  switch (type) {
    case "api/missing_authorization":
    case "api/expired_authorization":
    case "api/invalid_auth_format":
      return "De Unipile API-key ontbreekt of is verlopen. Maak een nieuwe aan in het Unipile-dashboard en zet hem in Vercel.";
    case "provider/invalid_authorization":
      return "Het LinkedIn-account is losgekoppeld van Unipile. Koppel het opnieuw in het Unipile-dashboard.";
    case "api/inactive_subscription":
      return "Je Unipile-abonnement is niet actief. Controleer je abonnement bij Unipile.";
    case "api/insufficient_permissions":
      return "Deze Unipile API-key mag dit niet. Gebruik een key van dezelfde applicatie als het LinkedIn-account.";
    case "provider/insufficient_permissions":
      return "Dit LinkedIn-account of abonnement mag deze actie niet uitvoeren.";
    case "api/invalid_parameters":
    case "provider/invalid_parameters":
      return `Unipile weigerde het verzoek (ongeldige parameters).${detail ? ` ${detail}` : ""}`;
    case "provider/resource_not_found":
      return "Niet gevonden bij LinkedIn (profiel bestaat niet meer of is afgeschermd).";
    case "api/resource_not_found":
      return "Unipile kent dit account of deze route niet. Controleer UNIPILE_ACCOUNT_ID.";
    case "api/too_many_requests":
    case "provider/too_many_requests":
      return "LinkedIn of Unipile vraagt om het rustiger aan te doen. Het gaat straks vanzelf verder.";
    case "provider/unprocessable_entity":
      return `LinkedIn kon dit niet verwerken.${detail ? ` ${detail}` : ""}`;
  }
  if (status === 401) return "Unipile weigert de toegang. Controleer de API-key en of het LinkedIn-account nog gekoppeld is.";
  if (status === 404) return "Niet gevonden bij Unipile of LinkedIn.";
  if (status >= 500) return "Er ging iets mis bij Unipile of LinkedIn. Probeer het later opnieuw.";
  return `Onverwachte fout van Unipile (${status}).`;
}

type Query = Record<string, string | number | string[] | undefined | null>;

export async function unipileRequest<T>(
  config: UnipileConfig,
  path: string,
  { method = "GET", query = {}, body }: { method?: "GET" | "POST"; query?: Query; body?: unknown } = {},
): Promise<T> {
  const url = new URL(`${config.baseUrl}/v2/${encodeURIComponent(config.accountId)}/${path.replace(/^\/+/, "")}`);
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) v.forEach((item) => url.searchParams.append(k, item));
    else url.searchParams.set(k, String(v));
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        "X-API-KEY": config.apiKey,
        accept: "application/json",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(45_000),
      cache: "no-store",
    });
  } catch (e) {
    const timeout = e instanceof Error && e.name === "TimeoutError";
    throw new UnipileError(
      timeout ? "Unipile reageerde niet op tijd. Probeer het opnieuw." : "Unipile is niet bereikbaar. Probeer het later opnieuw.",
      0,
      null,
    );
  }

  if (!res.ok) {
    let type: string | null = null;
    let detail = "";
    try {
      const err = (await res.json()) as { type?: string; detail?: string; title?: string };
      type = err.type ?? null;
      detail = err.detail ?? err.title ?? "";
    } catch {
      // geen JSON
    }
    const retryAfter = Number(res.headers.get("retry-after")) || null;
    console.error("Unipile-fout", res.status, type, detail, path);
    throw new UnipileError(explainUnipileError(res.status, type, detail), res.status, type, retryAfter);
  }
  return (await res.json()) as T;
}
