"use server";

import { createHash } from "node:crypto";

import { logActivity } from "@/lib/db/log";
import { createClient, getCurrentUser } from "@/lib/db/server";
import type { Json, SlotResult } from "@/lib/db/types";
import { isUuid } from "@/lib/domain/form-state";
import { type ImportProgress, processNextImport } from "@/lib/queue/import";
import { checkWorkingHours } from "@/lib/queue/schedule";
import { loadSettings } from "@/lib/settings";
import { getUnipileConfig, UnipileError } from "@/lib/unipile/client";
import { maxPageSize, searchLocations, searchPeople } from "@/lib/unipile/linkedin";
import type { SearchPerson } from "@/lib/unipile/map";

/** Zelfde hash als public.dnc_hash() in de database. */
const dncHash = (value: string) => createHash("sha256").update(value.trim().toLowerCase()).digest("hex");

export type LocationOption = { id: string; title: string };
export type ResultStatus = "new" | "exists" | "opted_out" | "queued";
export type AnnotatedPerson = SearchPerson & { status: ResultStatus; candidateId?: string };

export type SearchInput = {
  vacancyId: string;
  keywords: string;
  title: string;
  locationIds: string[];
  distances: (1 | 2 | 3)[];
  cursor?: string | null;
  searchId?: string | null;
};

export type SearchResult =
  | {
      ok: true;
      people: AnnotatedPerson[];
      cursor: string | null;
      total: number | null;
      searchId: string;
      usage: { used: number; limit: number };
    }
  | { ok: false; message: string };

function unipileMessage(e: unknown) {
  return e instanceof UnipileError ? e.message : "Er ging iets mis bij het zoeken. Probeer het opnieuw.";
}

/** Locaties opzoeken voor de filter (LinkedIn wil ID's, geen tekst). */
export async function findLocations(text: string): Promise<{ ok: true; items: LocationOption[] } | { ok: false; message: string }> {
  const keywords = text.trim().slice(0, 80);
  if (keywords.length < 2) return { ok: false, message: "Typ minstens 2 letters." };
  const { config, missing } = getUnipileConfig();
  if (!config) return { ok: false, message: `Unipile is nog niet ingesteld (${missing.join(", ")}).` };
  try {
    const items = await searchLocations(config, keywords);
    return items.length ? { ok: true, items } : { ok: false, message: `Geen locaties gevonden voor "${keywords}".` };
  } catch (e) {
    return { ok: false, message: unipileMessage(e) };
  }
}

/** Zoeken op LinkedIn en elk resultaat markeren: nieuw, al in database, afgemeld of in wachtrij. */
export async function runSearch(input: SearchInput): Promise<SearchResult> {
  if (!isUuid(input.vacancyId)) return { ok: false, message: "Onbekende vacature." };
  const keywords = input.keywords.trim().slice(0, 200);
  const title = input.title.trim().slice(0, 200);
  const locationIds = input.locationIds.filter((id) => /^\d+$/.test(id)).slice(0, 10);
  const distances = input.distances.filter((d) => d === 1 || d === 2 || d === 3);
  if (!keywords && !title && !locationIds.length) {
    return { ok: false, message: "Vul minstens trefwoorden, een functie of een locatie in." };
  }

  const { config, missing } = getUnipileConfig();
  if (!config) return { ok: false, message: `Unipile is nog niet ingesteld (${missing.join(", ")}).` };

  const supabase = await createClient();
  const user = await getCurrentUser();
  const settings = await loadSettings(supabase);

  const work = checkWorkingHours(new Date(), settings.schedule);
  if (!work.open) return { ok: false, message: work.reason };

  const { data: usedToday } = await supabase.rpc("linkedin_count", { p_kind: "search", p_period: "day" });
  if ((usedToday ?? 0) >= settings.maxSearchResultsPerDay) {
    return {
      ok: false,
      message: `Daglimiet bereikt: vandaag al ${usedToday} zoekresultaten opgehaald (max. ${settings.maxSearchResultsPerDay}). Morgen weer.`,
    };
  }

  let result;
  try {
    result = await searchPeople(config, {
      keywords,
      title,
      locationIds,
      networkDistance: distances,
      cursor: input.cursor ?? null,
      limit: Math.min(settings.searchPageSize, maxPageSize(config.api)),
    });
  } catch (e) {
    return { ok: false, message: unipileMessage(e) };
  }

  const query = { keywords, title, location_ids: locationIds, network_distance: distances } as Json;
  const { data: recorded } = await supabase.rpc("linkedin_record_search", {
    p_results: result.people.length,
    p_daily_limit: settings.maxSearchResultsPerDay,
    p_details: { vacancy_id: input.vacancyId, query } as Json,
  });
  const usage = recorded as unknown as SlotResult | null;

  // Zoekopdracht vastleggen (eerste pagina) en loggen.
  let searchId = input.searchId && isUuid(input.searchId) ? input.searchId : null;
  if (!searchId) {
    const { data: s } = await supabase
      .from("searches")
      .insert({ vacancy_id: input.vacancyId, query, api_type: config.api, results_count: result.total ?? result.people.length })
      .select("id")
      .single();
    searchId = s?.id ?? null;
    await logActivity(supabase, {
      actor: "user",
      actorId: user?.id,
      action: "linkedin_search",
      entity: "vacancy",
      entityId: input.vacancyId,
      details: { search_id: searchId, query, total: result.total },
    });
  }

  // Markeren.
  const ids = result.people.map((p) => p.providerId);
  const urls = result.people.map((p) => p.profileUrl).filter((u): u is string => Boolean(u));
  const hashes = [...ids, ...urls].map(dncHash);
  const [byId, byUrl, dnc, queued] = await Promise.all([
    ids.length ? supabase.from("candidates").select("id, linkedin_provider_id, status").in("linkedin_provider_id", ids) : { data: [] },
    urls.length ? supabase.from("candidates").select("id, linkedin_url, status").in("linkedin_url", urls) : { data: [] },
    hashes.length ? supabase.from("do_not_contact").select("hash").in("hash", hashes) : { data: [] },
    ids.length
      ? supabase.from("import_queue").select("provider_id").in("provider_id", ids).in("status", ["pending", "processing"])
      : { data: [] },
  ]);
  const dncSet = new Set((dnc.data ?? []).map((r) => r.hash));
  const queuedSet = new Set((queued.data ?? []).map((r) => r.provider_id));

  const people: AnnotatedPerson[] = result.people.map((p) => {
    const existing =
      (byId.data ?? []).find((c) => "linkedin_provider_id" in c && c.linkedin_provider_id === p.providerId) ??
      (byUrl.data ?? []).find((c) => "linkedin_url" in c && p.profileUrl && c.linkedin_url === p.profileUrl);
    const optedOut =
      dncSet.has(dncHash(p.providerId)) || (p.profileUrl && dncSet.has(dncHash(p.profileUrl))) || existing?.status === "opted_out";
    if (optedOut) return { ...p, status: "opted_out", candidateId: existing?.id };
    if (existing) return { ...p, status: "exists", candidateId: existing.id };
    if (queuedSet.has(p.providerId)) return { ...p, status: "queued" };
    return { ...p, status: "new" };
  });

  return {
    ok: true,
    people,
    cursor: result.cursor,
    total: result.total,
    searchId: searchId ?? "",
    usage: { used: usage?.used ?? 0, limit: settings.maxSearchResultsPerDay },
  };
}

/** Geselecteerde zoekresultaten in de importwachtrij zetten (nog geen LinkedIn-actie). */
export async function enqueueImports(
  vacancyId: string,
  searchId: string | null,
  people: { providerId: string; publicIdentifier: string | null; name: string }[],
): Promise<{ ok: boolean; added: number; message?: string }> {
  if (!isUuid(vacancyId)) return { ok: false, added: 0, message: "Onbekende vacature." };
  const clean = people.filter((p) => typeof p.providerId === "string" && p.providerId.length > 3).slice(0, 100);
  if (!clean.length) return { ok: false, added: 0, message: "Selecteer eerst één of meer personen." };

  const supabase = await createClient();
  const user = await getCurrentUser();
  let added = 0;
  for (const p of clean) {
    const { error } = await supabase.from("import_queue").insert({
      vacancy_id: vacancyId,
      search_id: searchId && isUuid(searchId) ? searchId : null,
      provider_id: p.providerId,
      public_identifier: p.publicIdentifier,
      name: p.name.slice(0, 200),
      created_by: user?.id ?? null,
    });
    if (!error) added++;
    else if (error.code !== "23505") console.error("In wachtrij zetten mislukt:", error);
  }
  await logActivity(supabase, {
    actor: "user",
    actorId: user?.id,
    action: "import_queued",
    entity: "vacancy",
    entityId: vacancyId,
    details: { count: added, search_id: searchId },
  });
  return { ok: true, added };
}

/** Eén stap van de import (wordt herhaald door de importpagina). */
export async function processImport(vacancyId: string): Promise<ImportProgress> {
  if (!isUuid(vacancyId)) {
    return {
      state: "error",
      message: "Onbekende vacature.",
      counts: { pending: 0, processing: 0, done: 0, skipped: 0, failed: 0 },
      items: [],
    };
  }
  const supabase = await createClient();
  const user = await getCurrentUser();
  return processNextImport(supabase, vacancyId, user?.id ?? null);
}
