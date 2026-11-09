/**
 * Omzetten van Unipile-antwoorden naar onze eigen vorm. Puur, zodat het los
 * te testen is. Veldnamen geverifieerd in docs/UNIPILE.md.
 */
import { languageForCountry, normalizeLinkedinUrl } from "../domain/forms.ts";

// ---------------------------------------------------------------------------
// Ruwe vormen (alleen de velden die we gebruiken)
// ---------------------------------------------------------------------------

export type RawSearchPerson = {
  type?: string;
  id: string;
  public_identifier?: string | null;
  public_profile_url?: string | null;
  profile_url?: string | null;
  name?: string | null;
  first_name?: string;
  last_name?: string;
  headline?: string;
  location?: string | null;
  network_distance?: string;
  pending_invitation?: boolean;
};

export type RawSearchResponse = {
  items?: RawSearchPerson[];
  cursor?: string | null;
  paging?: { start?: number | null; page_count?: number; total_count?: number | null };
};

export type RawProfile = {
  provider_id: string;
  public_identifier?: string | null;
  public_profile_url?: string;
  first_name?: string | null;
  last_name?: string | null;
  headline?: string;
  location?: string;
  summary?: string;
  work_experience?: { position?: string; company?: string; location?: string; start?: string | null; end?: string | null }[];
  skills?: { name: string }[];
  network_distance?: string;
};

// ---------------------------------------------------------------------------
// Zoekresultaten
// ---------------------------------------------------------------------------

export type SearchPerson = {
  providerId: string;
  publicIdentifier: string | null;
  name: string;
  headline: string;
  location: string;
  profileUrl: string | null;
  distance: 1 | 2 | 3 | null;
  pendingInvitation: boolean;
};

/** Profiellink zonder trackingparameters, in de vorm die wij opslaan. */
export function profileUrlOf(p: { public_profile_url?: string | null; profile_url?: string | null; public_identifier?: string | null }) {
  const fromUrl = normalizeLinkedinUrl(p.public_profile_url ?? "") ?? normalizeLinkedinUrl(p.profile_url ?? "");
  if (fromUrl) return fromUrl;
  return p.public_identifier ? normalizeLinkedinUrl(`https://www.linkedin.com/in/${p.public_identifier}`) : null;
}

function distanceOf(value: string | undefined): 1 | 2 | 3 | null {
  return value === "DISTANCE_1" || value === "FIRST_DEGREE"
    ? 1
    : value === "DISTANCE_2" || value === "SECOND_DEGREE"
      ? 2
      : value === "DISTANCE_3" || value === "THIRD_DEGREE"
        ? 3
        : null;
}

export function mapSearchResponse(raw: RawSearchResponse): {
  people: SearchPerson[];
  cursor: string | null;
  total: number | null;
} {
  const people = (raw.items ?? [])
    .filter((i) => (i.type ?? "PEOPLE") === "PEOPLE" && i.id)
    .map((i) => ({
      providerId: i.id,
      publicIdentifier: i.public_identifier ?? null,
      name: (i.name ?? [i.first_name, i.last_name].filter(Boolean).join(" ")).trim() || "LinkedIn-lid",
      headline: i.headline ?? "",
      location: i.location ?? "",
      profileUrl: profileUrlOf(i),
      distance: distanceOf(i.network_distance),
      pendingInvitation: Boolean(i.pending_invitation),
    }));
  return { people, cursor: raw.cursor ?? null, total: raw.paging?.total_count ?? null };
}

// ---------------------------------------------------------------------------
// Profiel → kandidaat
// ---------------------------------------------------------------------------

const COUNTRY_WORDS: [RegExp, string][] = [
  [/\b(netherlands|nederland|holland)\b/i, "NL"],
  [/\b(south africa|zuid-afrika|suid-afrika)\b/i, "ZA"],
  [/\b(belgium|belgië|belgie|belgique)\b/i, "BE"],
  [/\b(germany|duitsland|deutschland)\b/i, "DE"],
  [/\b(poland|polen|polska)\b/i, "PL"],
  [/\b(portugal)\b/i, "PT"],
];

/** "Venlo, Limburg, Netherlands" → "NL". Onbekend → null. */
export function countryFromLocation(location: string | null | undefined): string | null {
  if (!location) return null;
  for (const [re, code] of COUNTRY_WORDS) if (re.test(location)) return code;
  return null;
}

export type ImportedCandidate = {
  linkedin_provider_id: string;
  linkedin_url: string | null;
  full_name: string;
  headline: string | null;
  location: string | null;
  country: string | null;
  language: "nl" | "en";
  current_company: string | null;
  skills: string[];
  experience: { title: string; company: string; location: string | null; start: string | null; end: string | null }[];
};

/**
 * Maakt van een LinkedIn-profiel een kandidaat. E-mail en telefoon nemen we
 * bewust NIET over (besluit: alleen als de recruiter het zelf invult).
 */
export function profileToCandidate(p: RawProfile, fallbackName?: string): ImportedCandidate {
  const experience = (p.work_experience ?? []).map((w) => ({
    title: w.position ?? "",
    company: w.company ?? "",
    location: w.location ?? null,
    start: w.start ?? null,
    end: w.end ?? null,
  }));
  const current = experience.find((w) => !w.end) ?? null;
  const country = countryFromLocation(p.location);
  const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || fallbackName || "LinkedIn-lid";
  return {
    linkedin_provider_id: p.provider_id,
    linkedin_url: profileUrlOf(p),
    full_name: name,
    headline: p.headline || null,
    location: p.location || null,
    country,
    language: languageForCountry(country),
    current_company: current?.company || null,
    skills: [...new Set((p.skills ?? []).map((s) => s.name).filter(Boolean))],
    experience,
  };
}
