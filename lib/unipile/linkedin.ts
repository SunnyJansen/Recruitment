import "server-only";

import {
  incomingMessages,
  mapChats,
  mapRelations,
  mapSearchResponse,
  type RawChatsResponse,
  type RawMessagesResponse,
  type RawProfile,
  type RawRelationsResponse,
  type RawSearchResponse,
} from "./map";
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

// ---------------------------------------------------------------------------
// Automatisch benaderen (geverifieerd in docs/UNIPILE.md, sectie "Benaderen")
// ---------------------------------------------------------------------------

/**
 * Uitnodiging sturen (POST users/me/relation-requests). Zonder bericht:
 * een gratis LinkedIn-account mag maar ±5 uitnodigingen mét bericht per maand.
 */
export async function sendRelationRequest(config: UnipileConfig, userId: string) {
  return unipileRequest<{ id: string }>(config, "users/me/relation-requests", {
    method: "POST",
    body: { user_id: userId },
  });
}

/** Eigen connecties, nieuwste eerst (GET users/me/relations). */
export async function listRelations(config: UnipileConfig, cursor?: string | null) {
  const raw = await unipileRequest<RawRelationsResponse>(config, "users/me/relations", {
    query: { limit: 50, cursor: cursor ?? undefined },
  });
  return mapRelations(raw);
}

/**
 * Eerste bericht aan een connectie (POST inboxes/CLASSIC_PRIMARY/chats/send).
 * `users_ids` als enkele string = 1-op-1-gesprek (een lijst zou een groep maken).
 */
export async function startChat(config: UnipileConfig, userId: string, text: string) {
  return unipileRequest<{ chat_id: string; message_id: string }>(config, "inboxes/CLASSIC_PRIMARY/chats/send", {
    method: "POST",
    body: { users_ids: userId, text },
  });
}

/**
 * Recentste 1-op-1-gesprekken (GET chats), gesorteerd op laatste bericht,
 * nieuwste eerst. Let op: de filter `after` werkt op de aanmaakdatum van het
 * gesprek, niet op het laatste bericht, dus die gebruiken we niet.
 */
export async function listRecentChats(config: UnipileConfig) {
  const raw = await unipileRequest<RawChatsResponse>(config, "chats", {
    query: { type: "1to1", limit: 50 },
  });
  return mapChats(raw);
}

/** Berichten in een gesprek (GET chats/{id}/messages), eventueel sinds een tijdstip. */
export async function listIncomingMessages(config: UnipileConfig, chatId: string, after: string | null) {
  const raw = await unipileRequest<RawMessagesResponse>(config, `chats/${encodeURIComponent(chatId)}/messages`, {
    query: { limit: 20, after: after ?? undefined },
  });
  return incomingMessages(raw);
}
