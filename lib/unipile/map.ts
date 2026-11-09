/**
 * Omzetten van Unipile-antwoorden (API v2) naar onze eigen vorm. Puur, zodat
 * het los te testen is. Veldnamen geverifieerd in docs/UNIPILE.md.
 */
import { languageForCountry, normalizeLinkedinUrl } from "../domain/forms.ts";

// ---------------------------------------------------------------------------
// Ruwe vormen (alleen de velden die we gebruiken) — Unipile API v2
// ---------------------------------------------------------------------------

/** PeopleSearchResult (POST /v2/{account_id}/linkedin/search/people). */
export type RawSearchPerson = {
  object?: string;
  id: string;
  public_identifier?: string | null;
  profile_url?: string | null;
  display_name?: string | null;
  headline?: string | null;
  location?: string | null;
  network_distance?: string;
};

export type RawSearchResponse = {
  data?: RawSearchPerson[];
  total_count?: number | null;
  next_cursor?: string | null;
};

/** UserProfile (GET /v2/{account_id}/users/{user_id}). */
export type RawProfile = {
  id: string;
  public_identifier?: string | null;
  profile_url?: string | null;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  description?: string | null; // = kopregel (v1: headline)
  bio?: string | null;
  location?: string | null;
  emails?: string[];
  phone_numbers?: string[];
  specifics?: {
    network_distance?: string;
    experience?: {
      company?: { name?: string | null } | null;
      job_title?: string | null;
      started_on?: string | null;
      ended_on?: string | null;
      location?: string | null;
    }[];
    skills?: { name: string }[];
  } | null;
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
};

/** Profiellink zonder trackingparameters, in de vorm die wij opslaan. */
export function profileUrlOf(p: { profile_url?: string | null; public_identifier?: string | null }) {
  const fromUrl = normalizeLinkedinUrl(p.profile_url ?? "");
  if (fromUrl) return fromUrl;
  return p.public_identifier ? normalizeLinkedinUrl(`https://www.linkedin.com/in/${p.public_identifier}`) : null;
}

function distanceOf(value: string | undefined): 1 | 2 | 3 | null {
  return value === "FIRST_DEGREE" || value === "DISTANCE_1"
    ? 1
    : value === "SECOND_DEGREE" || value === "DISTANCE_2"
      ? 2
      : value === "THIRD_DEGREE" || value === "DISTANCE_3"
        ? 3
        : null;
}

export function mapSearchResponse(raw: RawSearchResponse): {
  people: SearchPerson[];
  cursor: string | null;
  total: number | null;
} {
  const people = (raw.data ?? [])
    .filter((i) => i.id && (i.object ?? "PeopleSearchResult") === "PeopleSearchResult")
    .map((i) => ({
      providerId: i.id,
      publicIdentifier: i.public_identifier ?? null,
      name: (i.display_name ?? "").trim() || "LinkedIn-lid",
      headline: i.headline ?? "",
      location: i.location ?? "",
      profileUrl: profileUrlOf(i),
      distance: distanceOf(i.network_distance),
    }));
  return { people, cursor: raw.next_cursor || null, total: raw.total_count ?? null };
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
  const experience = (p.specifics?.experience ?? []).map((w) => ({
    title: w.job_title ?? "",
    company: w.company?.name ?? "",
    location: w.location ?? null,
    start: w.started_on ?? null,
    end: w.ended_on ?? null,
  }));
  const current = experience.find((w) => !w.end) ?? null;
  const country = countryFromLocation(p.location);
  const name =
    (p.display_name ?? "").trim() ||
    [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
    fallbackName ||
    "LinkedIn-lid";
  return {
    linkedin_provider_id: p.id,
    linkedin_url: profileUrlOf(p),
    full_name: name,
    headline: p.description || null,
    location: p.location || null,
    country,
    language: languageForCountry(country),
    current_company: current?.company || null,
    skills: [...new Set((p.specifics?.skills ?? []).map((s) => s.name).filter(Boolean))],
    experience,
  };
}
