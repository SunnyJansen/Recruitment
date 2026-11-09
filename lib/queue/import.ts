import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logActivity } from "@/lib/db/log";
import type { Database, ImportQueueItem, ImportStatus, Json, SlotResult } from "@/lib/db/types";
import { checkWorkingHours } from "@/lib/queue/schedule";
import { loadSettings } from "@/lib/settings";
import { getUnipileConfig, UnipileError } from "@/lib/unipile/client";
import { getProfile } from "@/lib/unipile/linkedin";
import { profileToCandidate } from "@/lib/unipile/map";

export type ImportProgress = {
  state: "working" | "waiting" | "paused" | "finished" | "error";
  message?: string;
  /** Over hoeveel seconden de volgende stap mag. */
  waitSeconds?: number;
  counts: Record<ImportStatus, number>;
  items: Pick<ImportQueueItem, "id" | "name" | "status" | "result" | "candidate_id" | "processed_at">[];
};

type Db = SupabaseClient<Database>;

async function progressFor(supabase: Db, vacancyId: string): Promise<Pick<ImportProgress, "counts" | "items">> {
  const { data } = await supabase
    .from("import_queue")
    .select("id, name, status, result, candidate_id, processed_at")
    .eq("vacancy_id", vacancyId)
    .order("created_at", { ascending: false })
    .limit(200);
  const counts: Record<ImportStatus, number> = { pending: 0, processing: 0, done: 0, skipped: 0, failed: 0 };
  for (const r of data ?? []) counts[r.status]++;
  return { counts, items: data ?? [] };
}

/** Zoekt een bestaande kandidaat op LinkedIn-id of profiellink (geen dubbelen). */
async function findExisting(supabase: Db, providerId: string, url: string | null) {
  const byId = await supabase.from("candidates").select("id, status, linkedin_provider_id").eq("linkedin_provider_id", providerId).limit(1);
  if (byId.data?.length) return byId.data[0];
  if (url) {
    const byUrl = await supabase.from("candidates").select("id, status, linkedin_provider_id").eq("linkedin_url", url).limit(1);
    if (byUrl.data?.length) return byUrl.data[0];
  }
  return null;
}

/**
 * Verwerkt hoogstens ÉÉN item uit de importwachtrij van een vacature.
 * Wordt herhaald aangeroepen door de importpagina (en later door de cron).
 * Alle LinkedIn-regels (werktijden, willekeurige pauze, daglimiet) worden
 * hier en in de database (linkedin_take_slot) afgedwongen.
 */
export async function processNextImport(supabase: Db, vacancyId: string, actorId: string | null): Promise<ImportProgress> {
  await supabase.rpc("release_stuck_imports");
  const before = await progressFor(supabase, vacancyId);
  if (before.counts.pending === 0) {
    return { state: before.counts.processing ? "waiting" : "finished", waitSeconds: 10, ...before };
  }

  const { config, missing } = getUnipileConfig();
  if (!config) {
    return { state: "error", message: `Unipile is nog niet ingesteld. Ontbrekend in Vercel: ${missing.join(", ")}.`, ...before };
  }

  const settings = await loadSettings(supabase);
  const work = checkWorkingHours(new Date(), settings.schedule);
  if (!work.open) return { state: "paused", message: `${work.reason} De import gaat verder zodra het weer mag.`, ...before };

  const { data: slotRaw, error: slotError } = await supabase.rpc("linkedin_take_slot", {
    p_kind: "profile_view",
    p_daily_limit: settings.maxProfileViewsPerDay,
    p_weekly_limit: null,
    p_min_delay: settings.delayMinSeconds,
    p_max_delay: settings.delayMaxSeconds,
    p_details: { vacancy_id: vacancyId } as Json,
  });
  if (slotError) {
    console.error("linkedin_take_slot mislukt:", slotError);
    return { state: "error", message: "De limietcontrole in de database werkt niet. Is de migratie van fase 3 uitgevoerd?", ...before };
  }
  const slot = slotRaw as unknown as SlotResult;
  if (!slot.ok) {
    if (slot.reason === "wait") return { state: "waiting", waitSeconds: slot.wait_seconds ?? 30, ...before };
    return {
      state: "paused",
      message: `Daglimiet bereikt: ${slot.used} van ${slot.limit} profielbezoeken vandaag. Morgen gaat de import verder.`,
      ...before,
    };
  }

  const { data: claimed } = await supabase.rpc("claim_next_import", { p_vacancy_id: vacancyId });
  const item = (claimed as unknown as ImportQueueItem[] | null)?.[0];
  if (!item) return { state: "waiting", waitSeconds: slot.wait_seconds, ...(await progressFor(supabase, vacancyId)) };

  const finish = async (status: ImportStatus, result: string, candidateId: string | null = null) => {
    await supabase
      .from("import_queue")
      .update({ status, result, candidate_id: candidateId, processed_at: new Date().toISOString() })
      .eq("id", item.id);
  };

  // 1. Profiel ophalen (= het profielbezoek waarvoor we net een plek kregen).
  let profile;
  try {
    profile = await getProfile(config, item.provider_id);
  } catch (e) {
    const err = e instanceof UnipileError ? e : new UnipileError("Onbekende fout bij Unipile.", 0, null);
    // Tijdelijke problemen: terug in de wachtrij (max. 3 pogingen). Blijvende: overslaan.
    const temporary = [0, 429, 500, 502, 503, 504].includes(err.status) && item.attempts < 3;
    if (temporary) {
      await supabase.from("import_queue").update({ status: "pending", result: err.message }).eq("id", item.id);
    } else {
      await finish("failed", err.message);
    }
    const halt = err.status === 401 || err.status === 403;
    return {
      state: halt ? "error" : "waiting",
      message: halt ? err.message : `${item.name ?? "Profiel"}: ${err.message}`,
      waitSeconds: slot.wait_seconds,
      ...(await progressFor(supabase, vacancyId)),
    };
  }

  // 2. Opslaan zonder dubbelen.
  const data = profileToCandidate(profile, item.name ?? undefined);
  let candidateId: string;
  let candidateStatus: string;
  let status: ImportStatus = "done";
  let result = "Toegevoegd";

  const existing = await findExisting(supabase, data.linkedin_provider_id, data.linkedin_url);
  if (existing) {
    candidateId = existing.id;
    candidateStatus = existing.status;
    status = "skipped";
    result = "Stond al in de database";
    if (!existing.linkedin_provider_id) {
      await supabase.from("candidates").update({ linkedin_provider_id: data.linkedin_provider_id }).eq("id", existing.id);
    }
  } else {
    const inserted = await supabase
      .from("candidates")
      .insert({ ...data, experience: data.experience as unknown as Json, source: "linkedin_import" })
      .select("id, status")
      .single();
    if (inserted.error || !inserted.data) {
      if (inserted.error?.code === "23505") {
        const again = await findExisting(supabase, data.linkedin_provider_id, data.linkedin_url);
        if (again) {
          candidateId = again.id;
          candidateStatus = again.status;
          status = "skipped";
          result = "Stond al in de database";
        } else {
          await finish("failed", "Opslaan mislukt (dubbele sleutel).");
          return { state: "waiting", waitSeconds: slot.wait_seconds, ...(await progressFor(supabase, vacancyId)) };
        }
      } else {
        console.error("Kandidaat importeren mislukt:", inserted.error);
        await finish("failed", "Opslaan in de database is mislukt.");
        return { state: "waiting", waitSeconds: slot.wait_seconds, ...(await progressFor(supabase, vacancyId)) };
      }
    } else {
      candidateId = inserted.data.id;
      candidateStatus = inserted.data.status;
      await logActivity(supabase, {
        actor: "user",
        actorId,
        action: "candidate_created",
        entity: "candidate",
        entityId: candidateId,
        details: {
          source: "linkedin_import",
          vacancy_id: vacancyId,
          matched_do_not_contact: candidateStatus === "opted_out" ? true : undefined,
        },
      });
    }
  }

  // 3. Koppelen aan de vacature (alleen actieve kandidaten).
  if (candidateStatus === "active") {
    const { error: linkError } = await supabase
      .from("candidate_vacancy")
      .insert({ candidate_id: candidateId!, vacancy_id: vacancyId, stage: "new", stage_changed_by: actorId });
    if (!linkError) {
      const { data: vacancy } = await supabase.from("vacancies").select("title").eq("id", vacancyId).single();
      await logActivity(supabase, {
        actor: "user",
        actorId,
        action: "linked_to_vacancy",
        entity: "candidate",
        entityId: candidateId!,
        details: { vacancy_id: vacancyId, vacancy_title: vacancy?.title ?? null, via: "linkedin_import" },
      });
    } else if (linkError.code !== "23505") {
      console.error("Koppelen na import mislukt:", linkError);
    }
  } else {
    result = "Afgemeld (niet-benaderen-lijst): niet gekoppeld";
    status = "skipped";
  }

  await finish(status, result, candidateId!);
  return {
    state: "working",
    message: `${data.full_name}: ${result.toLowerCase()}.`,
    waitSeconds: slot.wait_seconds,
    ...(await progressFor(supabase, vacancyId)),
  };
}
