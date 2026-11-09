import "server-only";

import { mapSearchResponse, type RawProfile, type RawSearchResponse } from "./map";
import { unipileRequest, type UnipileConfig } from "./client";

/** Locatie-ID's opzoeken voor de zoekfilter (GET linkedin/search/parameters). */
export async function searchLocations(config: UnipileConfig, keywords: string) {
  const raw = await unipileRequest<{ items?: { id: string; title: string }[] }>(config, "linkedin/search/parameters", {
    query: { type: "LOCATION", keywords, limit: 10 },
  });
  return (raw.items ?? []).filter((i) => /^\d+$/.test(i.id)).map((i) => ({ id: i.id, title: i.title }));
}

export type PeopleSearch = {
  keywords?: string;
  title?: string;
  locationIds?: string[];
  networkDistance?: (1 | 2 | 3)[];
  cursor?: string | null;
  limit: number;
};

/** De body zoals Unipile hem verwacht (classic, personen). */
export function peopleSearchBody(s: PeopleSearch) {
  const body: Record<string, unknown> = { api: "classic", category: "people" };
  if (s.keywords) body.keywords = s.keywords;
  if (s.title) body.advanced_keywords = { title: s.title };
  if (s.locationIds?.length) body.location = s.locationIds;
  if (s.networkDistance?.length) body.network_distance = s.networkDistance;
  return body;
}

/** Classic: max. 10 personen per pagina; Sales Navigator/Recruiter: max. 100 (docs/UNIPILE.md). */
export function maxPageSize(api: UnipileConfig["api"]) {
  return api === "classic" ? 10 : 100;
}

/** Personen zoeken (POST linkedin/search). Met cursor (query-parameter): volgende pagina. */
export async function searchPeople(config: UnipileConfig, s: PeopleSearch) {
  const raw = await unipileRequest<RawSearchResponse>(config, "linkedin/search", {
    method: "POST",
    query: { limit: Math.min(Math.max(s.limit, 1), maxPageSize(config.api)), cursor: s.cursor ?? undefined },
    body: peopleSearchBody(s),
  });
  return mapSearchResponse(raw);
}

/**
 * Profiel ophalen (GET users/{id}) = één profielbezoek. Alleen de
 * "preview"-secties, zoals Unipile aanraadt bij veel bezoeken; geen melding
 * aan de persoon (notify=false).
 */
export async function getProfile(config: UnipileConfig, identifier: string) {
  return unipileRequest<RawProfile>(config, `users/${encodeURIComponent(identifier)}`, {
    query: { linkedin_sections: "*_preview", notify: "false" },
  });
}
