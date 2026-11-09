import "server-only";

/**
 * Unipile-client (alleen op de server: de API-key mag nooit naar de browser).
 * Endpoints en foutcodes geverifieerd in docs/UNIPILE.md.
 */

export type UnipileConfig = {
  baseUrl: string;
  apiKey: string;
  accountId: string;
  api: "classic" | "sales_navigator" | "recruiter";
};

/** Leest de Unipile-instellingen uit de env-vars. Geeft de ontbrekende namen terug als iets mist. */
export function getUnipileConfig(): { config: UnipileConfig | null; missing: string[] } {
  const dsn = (process.env.UNIPILE_DSN ?? "").trim().replace(/\/+$/, "");
  const apiKey = (process.env.UNIPILE_API_KEY ?? "").trim();
  const accountId = (process.env.UNIPILE_ACCOUNT_ID ?? "").trim();
  const apiRaw = (process.env.UNIPILE_LINKEDIN_API ?? "classic").trim();
  const missing = [
    !dsn && "UNIPILE_DSN",
    !apiKey && "UNIPILE_API_KEY",
    !accountId && "UNIPILE_ACCOUNT_ID",
  ].filter(Boolean) as string[];
  if (missing.length) return { config: null, missing };
  const api = apiRaw === "sales_navigator" || apiRaw === "recruiter" ? apiRaw : "classic";
  // De DSN staat in het dashboard zonder https:// (bijv. api8.unipile.com:13851).
  const baseUrl = /^https?:\/\//i.test(dsn) ? dsn : `https://${dsn}`;
  return { config: { baseUrl, apiKey, accountId, api }, missing: [] };
}

export class UnipileError extends Error {
  constructor(
    message: string,
    public status: number,
    public type: string | null,
  ) {
    super(message);
  }
}

/** Nederlandse uitleg per foutcode (docs/UNIPILE.md). */
export function explainUnipileError(status: number, type: string | null, detail?: string): string {
  if (type === "errors/cannot_resend_yet" || (status === 422 && /cannot_resend_yet/.test(detail ?? ""))) {
    return "LinkedIn-limiet bereikt voor uitnodigingen. Probeer het later opnieuw.";
  }
  switch (status) {
    case 400:
      return `Unipile begreep de zoekopdracht niet (ongeldige filters).${detail ? ` ${detail}` : ""}`;
    case 401:
      return "Het LinkedIn-account is losgekoppeld van Unipile, of de API-key klopt niet. Koppel het account opnieuw in het Unipile-dashboard.";
    case 403:
      return "Geen toegang: dit LinkedIn-account of abonnement mag deze actie niet uitvoeren.";
    case 404:
      return "Niet gevonden bij LinkedIn (profiel bestaat niet meer of is afgeschermd).";
    case 429:
      return "LinkedIn of Unipile vraagt om het rustiger aan te doen. Probeer het later opnieuw.";
    case 503:
      return "Unipile heeft op dit moment geen verbinding met het LinkedIn-account. Probeer het over een paar minuten opnieuw.";
    case 504:
      return "LinkedIn reageerde niet op tijd. Probeer het opnieuw.";
    default:
      return status >= 500
        ? "Er ging iets mis bij Unipile of LinkedIn. Probeer het later opnieuw."
        : `Onverwachte fout van Unipile (${status}).`;
  }
}

export async function unipileRequest<T>(
  config: UnipileConfig,
  path: string,
  { method = "GET", query = {}, body }: { method?: "GET" | "POST"; query?: Record<string, string | number | undefined>; body?: unknown } = {},
): Promise<T> {
  const url = new URL(`${config.baseUrl}/api/v1/${path.replace(/^\/+/, "")}`);
  url.searchParams.set("account_id", config.accountId);
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));

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
      timeout ? "Unipile reageerde niet op tijd. Probeer het opnieuw." : "Unipile is niet bereikbaar. Controleer UNIPILE_DSN.",
      0,
      null,
    );
  }

  if (!res.ok) {
    let type: string | null = null;
    let detail = "";
    try {
      const err = (await res.json()) as { type?: string; detail?: string; title?: string; message?: string };
      type = err.type ?? null;
      detail = err.detail ?? err.message ?? err.title ?? "";
    } catch {
      // geen JSON
    }
    console.error("Unipile-fout", res.status, type, detail, path);
    throw new UnipileError(explainUnipileError(res.status, type, detail), res.status, type);
  }
  return (await res.json()) as T;
}
