/**
 * Controle en omzetting van formulieren voor vacatures en kandidaten.
 * Puur (geen database), zodat het los te testen is: scripts/test-forms.mjs.
 */

export type FormInput = Record<string, string | string[] | undefined>;
export type FieldErrors = Record<string, string>;
export type ParseResult<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors };

/** Zet FormData om naar een gewoon object; velden die vaker voorkomen worden een lijst. */
export function formDataToInput(fd: FormData): FormInput {
  const out: FormInput = {};
  for (const key of new Set(fd.keys())) {
    const all = fd.getAll(key).map((v) => (typeof v === "string" ? v : ""));
    out[key] = all.length > 1 || key.endsWith("[]") ? all : all[0];
  }
  return out;
}

function str(input: FormInput, key: string): string {
  const v = input[key];
  return (Array.isArray(v) ? v[0] : v ?? "").trim();
}

function list(input: FormInput, key: string): string[] {
  const v = input[key] ?? input[`${key}[]`];
  if (v === undefined) return [];
  return (Array.isArray(v) ? v : [v]).map((s) => s.trim()).filter(Boolean);
}

/** "TIG, MIG;  RVS" → ["TIG", "MIG", "RVS"] (komma, puntkomma of nieuwe regel), zonder dubbelen. */
export function splitList(value: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of value.split(/[,;\n]/)) {
    const item = part.trim();
    if (item && !seen.has(item.toLowerCase())) {
      seen.add(item.toLowerCase());
      out.push(item);
    }
  }
  return out;
}

function optionalInt(value: string, field: string, errors: FieldErrors, max: number): number | null {
  if (!value) return null;
  const n = Number(value.replace(",", "."));
  if (!Number.isInteger(n) || n < 0 || n > max) {
    errors[field] = `Vul een heel getal in tussen 0 en ${max}.`;
    return null;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Vacatures
// ---------------------------------------------------------------------------

export type Requirements = {
  lasprocessen: string[];
  materialen: string[];
  verplichte_skills: string[];
  gewenste_skills: string[];
  certificaten: string[];
  min_jaren_ervaring: number | null;
  opleiding: string;
  talen: string[];
  max_reisafstand_km: number | null;
  salaris: string;
};

export const EMPTY_REQUIREMENTS: Requirements = {
  lasprocessen: [],
  materialen: [],
  verplichte_skills: [],
  gewenste_skills: [],
  certificaten: [],
  min_jaren_ervaring: null,
  opleiding: "",
  talen: [],
  max_reisafstand_km: null,
  salaris: "",
};

/** Leest eisen uit de database veilig in, ook als er velden ontbreken. */
export function readRequirements(json: unknown): Requirements {
  const r = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    lasprocessen: arr(r.lasprocessen),
    materialen: arr(r.materialen),
    verplichte_skills: arr(r.verplichte_skills),
    gewenste_skills: arr(r.gewenste_skills),
    certificaten: arr(r.certificaten),
    min_jaren_ervaring: num(r.min_jaren_ervaring),
    opleiding: text(r.opleiding),
    talen: arr(r.talen),
    max_reisafstand_km: num(r.max_reisafstand_km),
    salaris: text(r.salaris),
  };
}

export type VacancyData = {
  title: string;
  description: string | null;
  location: string | null;
  country: string;
  status: "draft" | "open" | "paused" | "closed";
  requirements: Requirements;
};

const VACANCY_STATUSES = ["draft", "open", "paused", "closed"] as const;

export function parseVacancyForm(input: FormInput): ParseResult<VacancyData> {
  const errors: FieldErrors = {};
  const title = str(input, "title");
  if (!title) errors.title = "Vul een functietitel in.";
  else if (title.length > 200) errors.title = "Maximaal 200 tekens.";

  const country = str(input, "country") || "NL";
  if (!/^[A-Z]{2}$|^OTHER$/.test(country)) errors.country = "Kies een land.";

  const statusRaw = str(input, "status") || "open";
  const status = (VACANCY_STATUSES as readonly string[]).includes(statusRaw)
    ? (statusRaw as VacancyData["status"])
    : null;
  if (!status) errors.status = "Kies een status.";

  const requirements: Requirements = {
    lasprocessen: list(input, "lasprocessen"),
    materialen: list(input, "materialen"),
    verplichte_skills: splitList(str(input, "verplichte_skills")),
    gewenste_skills: splitList(str(input, "gewenste_skills")),
    certificaten: splitList(str(input, "certificaten")),
    min_jaren_ervaring: optionalInt(str(input, "min_jaren_ervaring"), "min_jaren_ervaring", errors, 50),
    opleiding: str(input, "opleiding"),
    talen: splitList(str(input, "talen")),
    max_reisafstand_km: optionalInt(str(input, "max_reisafstand_km"), "max_reisafstand_km", errors, 2000),
    salaris: str(input, "salaris"),
  };

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    data: {
      title,
      description: str(input, "description") || null,
      location: str(input, "location") || null,
      country,
      status: status!,
      requirements,
    },
  };
}

// ---------------------------------------------------------------------------
// Kandidaten
// ---------------------------------------------------------------------------

/** Nederlands voor kandidaten in Nederland, Engels voor de rest (docs/BESLUITEN.md). */
export function languageForCountry(country: string | null | undefined): "nl" | "en" {
  return country === "NL" ? "nl" : "en";
}

/**
 * Maakt een LinkedIn-profiellink eenvormig, zodat dezelfde persoon niet twee
 * keer wordt toegevoegd: https://www.linkedin.com/in/<naam>. Geeft null bij
 * een link die geen LinkedIn-profiel is.
 */
export function normalizeLinkedinUrl(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return null;
  const match = url.pathname.match(/^\/in\/([^/?#]+)/i);
  if (!match) return null;
  const slug = decodeURIComponent(match[1]).toLowerCase();
  return `https://www.linkedin.com/in/${encodeURIComponent(slug)}`;
}

export type CandidateData = {
  full_name: string;
  linkedin_url: string | null;
  headline: string | null;
  current_company: string | null;
  location: string | null;
  country: string | null;
  language: "nl" | "en";
  email: string | null;
  phone: string | null;
  skills: string[];
  experience: { omschrijving: string }[];
};

export function parseCandidateForm(input: FormInput): ParseResult<CandidateData> {
  const errors: FieldErrors = {};
  const full_name = str(input, "full_name");
  if (!full_name) errors.full_name = "Vul een naam in.";
  else if (full_name.length > 200) errors.full_name = "Maximaal 200 tekens.";

  const linkedinRaw = str(input, "linkedin_url");
  const linkedin_url = normalizeLinkedinUrl(linkedinRaw);
  if (linkedinRaw && !linkedin_url) {
    errors.linkedin_url = "Dit is geen LinkedIn-profiellink (zoals https://www.linkedin.com/in/naam).";
  }

  const emailRaw = str(input, "email").toLowerCase();
  if (emailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) errors.email = "Dit e-mailadres klopt niet.";

  const country = str(input, "country") || null;
  if (country && !/^[A-Z]{2}$|^OTHER$/.test(country)) errors.country = "Kies een land.";

  const langRaw = str(input, "language");
  const language = langRaw === "nl" || langRaw === "en" ? langRaw : languageForCountry(country);

  const phone = str(input, "phone");
  if (phone && !/^[+0-9 ()-]{6,20}$/.test(phone)) errors.phone = "Gebruik alleen cijfers, spaties en + ( ) -.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    data: {
      full_name,
      linkedin_url,
      headline: str(input, "headline") || null,
      current_company: str(input, "current_company") || null,
      location: str(input, "location") || null,
      country,
      language,
      email: emailRaw || null,
      phone: phone || null,
      skills: splitList(str(input, "skills")),
      experience: str(input, "experience")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((omschrijving) => ({ omschrijving })),
    },
  };
}

/** Ervaring uit de database terug naar tekst voor het formulier (één regel per baan). */
export function experienceToText(json: unknown): string {
  if (!Array.isArray(json)) return "";
  return json
    .map((e) => {
      if (typeof e === "string") return e;
      if (e && typeof e === "object") {
        const o = e as Record<string, unknown>;
        if (typeof o.omschrijving === "string") return o.omschrijving;
        return [o.title, o.company, o.period].filter((x) => typeof x === "string" && x).join(" – ");
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}
