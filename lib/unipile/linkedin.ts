import "server-only";

import { mapSearchResponse, type RawProfile, type RawSearchResponse } from "./map";
import { unipileRequest, type UnipileConfig } from "./client";

/** Locatie-ID's opzoeken voor de zoekfilter (GET /v2/{acc}/linkedin/search/parameters). */
export async function searchLocations(config: UnipileConfig, keywords: string) {
  const raw = await unipileRequest<{ data?: { id: string; name: string }[] }>(config, "linkedin/search/parameters", {
    query: { type: "LOCATION", keywords, limit: 10 },
  });
  return (raw.data ?? []).filter((i) => i.id && i.name).map((i) => ({ id: String(i.id), title: i.name }));
}

export type PeopleSearch = {
  keywords?: string;
  title?: string;
  locationIds?: string[];
  networkDistance?: (1 | 2 | 3)[];
  cursor?: string | null;
};

/** De body zoals Unipile v2 hem verwacht (classic, personen). */
export function peopleSearchBody(s: PeopleSearch) {
  const body: Record<string, unknown> = {};
  if (s.keywords) body.keywords = s.keywords;
  if (s.title) body.advanced_keywords = { title: s.title };
  if (s.locationIds?.length) body.location = s.locationIds;
  if (s.networkDistance?.length) body.network_distance = s.networkDistance;
  return body;
}

/**
 * Personen zoeken (POST /v2/{acc}/linkedin/search/people). Volgende pagina:
 * zelfde zoekopdracht met `cursor` = `next_cursor` van de vorige pagina.
 * Classic LinkedIn geeft 10 personen per pagina.
 */
export async function searchPeople(config: UnipileConfig, s: PeopleSearch) {
  const raw = await unipileRequest<RawSearchResponse>(config, "linkedin/search/people", {
    method: "POST",
    query: { cursor: s.cursor ?? undefined },
    body: peopleSearchBody(s),
  });
  return mapSearchResponse(raw);
}

/**
 * Profiel ophalen (GET /v2/{acc}/users/{user_id}) = één profielbezoek.
 * Alleen de "preview"-secties, zoals Unipile aanraadt bij veel bezoeken.
 * In v2 krijgt de persoon standaard GEEN melding van het bezoek.
 */
export async function getProfile(config: UnipileConfig, userId: string) {
  return unipileRequest<RawProfile>(config, `users/${encodeURIComponent(userId)}`, {
    query: { with_sections: ["linkedin_*_preview"], variant: "linkedin_classic" },
  });
}
