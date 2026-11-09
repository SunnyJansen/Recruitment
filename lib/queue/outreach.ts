import "server-only";

import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logActivity } from "@/lib/db/log";
import type { Database, Json, SlotResult } from "@/lib/db/types";
import { isOptOutReply } from "@/lib/domain/templates";
import { checkWorkingHours } from "@/lib/queue/schedule";
import { loadSettings, type AppSettings } from "@/lib/settings";
import { getUnipileConfig, UnipileError, unipileSetupProblem, type UnipileConfig } from "@/lib/unipile/client";
import {
  listIncomingMessages,
  listRecentChats,
  listRelations,
  searchPeople,
  sendRelationRequest,
  startChat,
} from "@/lib/unipile/linkedin";
import { countryFromLocation } from "@/lib/unipile/map";
import { languageForCountry } from "@/lib/domain/forms";

/**
 * De motor van "automatisch benaderen". Eén aanroep = één tik (de externe
 * cron roept dit elke paar minuten aan). Per tik hoogstens ÉÉN actie richting
 * LinkedIn; de database (linkedin_take_slot) bewaakt pauzes en limieten.
 *
 * Volgorde per tik:
 *   1. reacties ophalen (lezen, mag elke tik)               → gereageerd / afgemeld
 *   2. connecties controleren (enkele keren per dag, willekeurig) → verbonden
 *   3. één actie: bericht aan nieuwe connectie, anders uitnodiging,
 *      anders nieuwe kandidaten zoeken voor een actieve campagne
 */

type Db = SupabaseClient<Database>;

export type TickReport = {
  state: "done" | "idle" | "paused" | "waiting" | "error";
  steps: string[];
  message?: string;
};

const dncHash = (value: string) => createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
const randomSeconds = (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1));
const POOL_TARGET = 10; // zoveel kandidaten klaarzetten per campagne

/** Is het tijd voor een periodieke controle? Zo ja: volgende keer willekeurig plannen. */
async function due(supabase: Db, key: "relations_check" | "chats_check", minSec: number, maxSec: number) {
  const { data } = await supabase.from("rate_state").select("next_at").eq("key", key).maybeSingle();
  if (data && new Date(data.next_at).getTime() > Date.now()) return false;
  const next = new Date(Date.now() + randomSeconds(minSec, maxSec) * 1000).toISOString();
  if (data) await supabase.from("rate_state").update({ next_at: next }).eq("key", key);
  else await supabase.from("rate_state").insert({ key, next_at: next });
  return true;
}

async function takeSlot(supabase: Db, s: AppSettings, kind: "invite" | "message" | "search", details: Json) {
  const limits = {
    invite: { daily: s.maxInvitesPerDay, weekly: s.maxInvitesPerWeek },
    message: { daily: s.maxMessagesPerDay, weekly: null },
    search: { daily: s.maxSearchResultsPerDay, weekly: null },
  }[kind];
  const { data, error } = await supabase.rpc("linkedin_take_slot", {
    p_kind: kind,
    p_daily_limit: limits.daily,
    p_weekly_limit: limits.weekly,
    p_min_delay: s.delayMinSeconds,
    p_max_delay: s.delayMaxSeconds,
    p_details: details,
  });
  if (error) throw new Error(`Limietcontrole mislukt: ${error.message}`);
  return data as unknown as SlotResult;
}

// ---------------------------------------------------------------------------
// 1. Reacties
// ---------------------------------------------------------------------------

async function checkReplies(supabase: Db, config: UnipileConfig): Promise<string[]> {
  const steps: string[] = [];
  // Kandidaten die we benaderd hebben (en nog niet afgemeld zijn).
  const { data: links } = await supabase
    .from("candidate_vacancy")
    .select("candidate_id, vacancy_id, chat_id, outreach_status, messaged_at, replied_at, stage")
    .in("outreach_status", ["invited", "connected", "messaged", "replied"]);
  if (!links?.length) return steps;

  const candidateIds = [...new Set(links.map((l) => l.candidate_id))];
  const { data: cands } = await supabase
    .from("candidates")
    .select("id, full_name, linkedin_provider_id, status")
    .in("id", candidateIds);
  const byProvider = new Map((cands ?? []).filter((c) => c.linkedin_provider_id).map((c) => [c.linkedin_provider_id!, c]));
  const byChat = new Map(links.filter((l) => l.chat_id).map((l) => [l.chat_id!, l]));

  const chats = await listRecentChats(config);
  for (const chat of chats) {
    const cand = byProvider.get(chat.userId);
    const link = byChat.get(chat.chatId) ?? links.find((l) => cand && l.candidate_id === cand.id);
    if (!cand || !link || cand.status !== "active") continue;
    const since = link.replied_at ?? link.messaged_at ?? null;
    if (since && chat.lastMessageAt && chat.lastMessageAt <= since) continue;

    const incoming = await listIncomingMessages(config, chat.chatId, since);
    let newest: string | null = null;
    let optOut = false;
    for (const m of incoming) {
      const { error } = await supabase.from("messages").insert({
        candidate_id: cand.id,
        vacancy_id: link.vacancy_id,
        channel: "linkedin_message",
        direction: "in",
        body: m.text,
        status: "received",
        unipile_chat_id: chat.chatId,
        unipile_message_id: m.messageId,
        reply_category: isOptOutReply(m.text) ? "opt_out" : "review",
        sent_at: m.at,
      });
      if (error?.code === "23505") continue; // al opgeslagen
      if (error) {
        console.error("Reactie opslaan mislukt:", error);
        continue;
      }
      newest = m.at;
      if (isOptOutReply(m.text)) optOut = true;
    }
    if (!newest) continue;

    await supabase
      .from("candidate_vacancy")
      .update({
        outreach_status: "replied",
        replied_at: newest,
        chat_id: chat.chatId,
        ...(["new", "contacted"].includes(link.stage) ? { stage: "replied" as const } : {}),
      })
      .eq("candidate_id", cand.id)
      .eq("vacancy_id", link.vacancy_id);
    await supabase.from("candidates").update({ last_reply_at: newest }).eq("id", cand.id);
    await logActivity(supabase, {
      actor: "system",
      action: "reply_received",
      entity: "candidate",
      entityId: cand.id,
      details: { vacancy_id: link.vacancy_id, chat_id: chat.chatId },
    });
    steps.push(`Reactie van ${cand.full_name}`);

    if (optOut) {
      // Harde regel 3: "geen interesse"/afmelden → nooit meer benaderen.
      await supabase.from("candidates").update({ status: "opted_out" }).eq("id", cand.id).eq("status", "active");
      await logActivity(supabase, {
        actor: "system",
        action: "opted_out",
        entity: "candidate",
        entityId: cand.id,
        details: { reason: "afmelding in reactie op LinkedIn" },
      });
      steps.push(`${cand.full_name} afgemeld (geen interesse)`);
    }
  }
  return steps;
}

// ---------------------------------------------------------------------------
// 2. Connecties (geaccepteerde uitnodigingen)
// ---------------------------------------------------------------------------

async function checkConnections(supabase: Db, config: UnipileConfig, withdrawAfterDays: number): Promise<string[]> {
  const steps: string[] = [];
  const { data: invited } = await supabase
    .from("candidate_vacancy")
    .select("candidate_id, vacancy_id, invited_at")
    .eq("outreach_status", "invited");
  if (!invited?.length) return steps;

  const { data: cands } = await supabase
    .from("candidates")
    .select("id, full_name, linkedin_provider_id, linkedin_url")
    .in("id", invited.map((i) => i.candidate_id));

  // Nieuwste connecties staan bovenaan; 3 pagina's (150) is ruim genoeg bij ±20 uitnodigingen per dag.
  const ids = new Set<string>();
  const urls = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < 3; page++) {
    const r = await listRelations(config, cursor);
    r.relations.forEach((rel) => {
      ids.add(rel.userId);
      if (rel.profileUrl) urls.add(rel.profileUrl);
    });
    cursor = r.cursor;
    if (!cursor) break;
  }

  for (const inv of invited) {
    const c = (cands ?? []).find((x) => x.id === inv.candidate_id);
    if (!c) continue;
    const accepted = (c.linkedin_provider_id && ids.has(c.linkedin_provider_id)) || (c.linkedin_url && urls.has(c.linkedin_url));
    if (accepted) {
      await supabase
        .from("candidate_vacancy")
        .update({ outreach_status: "connected", connected_at: new Date().toISOString() })
        .eq("candidate_id", inv.candidate_id)
        .eq("vacancy_id", inv.vacancy_id);
      await logActivity(supabase, {
        actor: "system",
        action: "invite_accepted",
        entity: "candidate",
        entityId: inv.candidate_id,
        details: { vacancy_id: inv.vacancy_id },
      });
      steps.push(`${c.full_name} accepteerde de uitnodiging`);
    } else if (inv.invited_at && Date.now() - new Date(inv.invited_at).getTime() > withdrawAfterDays * 86_400_000) {
      await supabase
        .from("candidate_vacancy")
        .update({ outreach_status: "failed", outreach_error: `Uitnodiging na ${withdrawAfterDays} dagen niet geaccepteerd` })
        .eq("candidate_id", inv.candidate_id)
        .eq("vacancy_id", inv.vacancy_id);
      steps.push(`${c.full_name}: uitnodiging verlopen`);
    }
  }
  return steps;
}

// ---------------------------------------------------------------------------
// 3a. Bericht aan nieuwe connectie
// ---------------------------------------------------------------------------

async function activeCampaignIds(supabase: Db) {
  const { data } = await supabase.from("campaigns").select("id, vacancy_id, search_query, search_cursor, search_exhausted").eq("status", "active");
  return data ?? [];
}

async function sendNextMessage(supabase: Db, config: UnipileConfig, s: AppSettings, campaignIds: string[]): Promise<string | "wait" | null> {
  const { data: next } = await supabase
    .from("candidate_vacancy")
    .select("candidate_id, vacancy_id, campaign_id, stage")
    .eq("outreach_status", "connected")
    .in("campaign_id", campaignIds)
    .order("connected_at", { ascending: true })
    .limit(1);
  const link = next?.[0];
  if (!link?.campaign_id) return null;

  const { data: cand } = await supabase.from("candidates").select("id, full_name, status, linkedin_provider_id").eq("id", link.candidate_id).single();
  if (!cand || cand.status !== "active" || !cand.linkedin_provider_id) {
    await supabase.from("candidate_vacancy").update({ outreach_status: "skipped", outreach_error: "Niet (meer) actief" }).eq("candidate_id", link.candidate_id).eq("vacancy_id", link.vacancy_id);
    return null;
  }

  const slot = await takeSlot(supabase, s, "message", { candidate_id: cand.id });
  if (!slot.ok) return "wait";

  // De goedgekeurde tekst, ingevuld door de database (zelfde functie als de controle).
  const { data: body } = await supabase.rpc("render_campaign_message", { p_campaign_id: link.campaign_id, p_candidate_id: cand.id });
  if (typeof body !== "string" || !body.trim()) throw new Error("Berichttekst kon niet worden ingevuld.");

  const { data: msg, error: msgError } = await supabase
    .from("messages")
    .insert({
      candidate_id: cand.id,
      vacancy_id: link.vacancy_id,
      campaign_id: link.campaign_id,
      channel: "linkedin_message",
      direction: "out",
      body,
      status: "approved",
    })
    .select("id")
    .single();
  if (msgError || !msg) throw new Error(`Bericht klaarzetten geweigerd: ${msgError?.message}`);

  try {
    const sent = await startChat(config, cand.linkedin_provider_id, body);
    const now = new Date().toISOString();
    await supabase.from("messages").update({ status: "sent", sent_at: now, unipile_chat_id: sent.chat_id, unipile_message_id: sent.message_id }).eq("id", msg.id);
    await supabase
      .from("candidate_vacancy")
      .update({ outreach_status: "messaged", messaged_at: now, chat_id: sent.chat_id })
      .eq("candidate_id", cand.id)
      .eq("vacancy_id", link.vacancy_id);
    await supabase.from("candidates").update({ last_contacted_at: now }).eq("id", cand.id);
    await logActivity(supabase, {
      actor: "system",
      action: "message_sent",
      entity: "candidate",
      entityId: cand.id,
      details: { vacancy_id: link.vacancy_id, campaign_id: link.campaign_id, message_id: msg.id },
    });
    return `Bericht gestuurd aan ${cand.full_name}`;
  } catch (e) {
    const err = e instanceof UnipileError ? e : new UnipileError(String(e), 0, null);
    await supabase.from("messages").update({ status: "failed", error: err.message }).eq("id", msg.id);
    if (!err.temporary) {
      await supabase
        .from("candidate_vacancy")
        .update({ outreach_status: "failed", outreach_error: err.message })
        .eq("candidate_id", cand.id)
        .eq("vacancy_id", link.vacancy_id);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// 3b. Uitnodiging
// ---------------------------------------------------------------------------

/** Mag de volgende uitnodiging een tekst hebben? (weektegoed + niet geblokkeerd door LinkedIn) */
async function inviteNotesAvailable(supabase: Db, s: AppSettings) {
  if (s.maxInviteNotesPerWeek <= 0) return false;
  const { data: block } = await supabase.from("rate_state").select("next_at").eq("key", "invite_notes").maybeSingle();
  if (block && new Date(block.next_at).getTime() > Date.now()) return false;
  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("channel", "linkedin_invite")
    .eq("status", "sent")
    .gte("sent_at", new Date(Date.now() - 7 * 86_400_000).toISOString());
  return (count ?? 0) < s.maxInviteNotesPerWeek;
}

async function sendNextInvite(supabase: Db, config: UnipileConfig, s: AppSettings, campaignIds: string[]): Promise<string | "wait" | null> {
  const { data: next } = await supabase
    .from("candidate_vacancy")
    .select("candidate_id, vacancy_id, campaign_id, stage")
    .eq("outreach_status", "pending")
    .in("campaign_id", campaignIds)
    .order("created_at", { ascending: true })
    .limit(1);
  const link = next?.[0];
  if (!link) return null;

  const { data: cand } = await supabase.from("candidates").select("id, full_name, status, linkedin_provider_id").eq("id", link.candidate_id).single();
  if (!cand || cand.status !== "active" || !cand.linkedin_provider_id) {
    await supabase.from("candidate_vacancy").update({ outreach_status: "skipped", outreach_error: "Afgemeld of geen LinkedIn-id" }).eq("candidate_id", link.candidate_id).eq("vacancy_id", link.vacancy_id);
    return null;
  }

  const slot = await takeSlot(supabase, s, "invite", { candidate_id: cand.id });
  if (!slot.ok) return "wait";

  // Korte, goedgekeurde tekst erbij zolang het weektegoed (gratis LinkedIn: ±15) het toelaat.
  let note: string | null = null;
  let noteMessageId: string | null = null;
  if (await inviteNotesAvailable(supabase, s)) {
    const { data: rendered } = await supabase.rpc("render_campaign_message", {
      p_campaign_id: link.campaign_id!,
      p_candidate_id: cand.id,
      p_kind: "invite",
    });
    if (typeof rendered === "string" && rendered.trim() && rendered.length <= s.inviteNoteMaxChars) {
      const { data: msg, error } = await supabase
        .from("messages")
        .insert({
          candidate_id: cand.id,
          vacancy_id: link.vacancy_id,
          campaign_id: link.campaign_id,
          channel: "linkedin_invite",
          direction: "out",
          body: rendered,
          status: "approved",
        })
        .select("id")
        .single();
      if (error || !msg) throw new Error(`Uitnodigingstekst geweigerd: ${error?.message}`);
      note = rendered;
      noteMessageId = msg.id;
    }
  }

  try {
    await sendRelationRequest(config, cand.linkedin_provider_id, note ?? undefined);
  } catch (e) {
    const err = e instanceof UnipileError ? e : new UnipileError(String(e), 0, null);
    if (noteMessageId) await supabase.from("messages").update({ status: "failed", error: err.message }).eq("id", noteMessageId);
    if (note && (err.status === 422 || err.type === "provider/unprocessable_entity")) {
      // LinkedIn weigert een uitnodiging mét tekst (tegoed op): een week lang zonder tekst.
      // De kandidaat blijft in de rij en krijgt bij de volgende stap een uitnodiging zonder tekst.
      await supabase
        .from("rate_state")
        .update({ next_at: new Date(Date.now() + 7 * 86_400_000).toISOString() })
        .eq("key", "invite_notes");
      await logActivity(supabase, {
        actor: "system",
        action: "invite_notes_paused",
        entity: "system",
        details: { reason: err.message },
      });
      return "Uitnodiging met tekst geweigerd door LinkedIn (tegoed op); de komende week zonder tekst";
    }
    if (!err.temporary) {
      await supabase
        .from("candidate_vacancy")
        .update({ outreach_status: "failed", outreach_error: err.message })
        .eq("candidate_id", cand.id)
        .eq("vacancy_id", link.vacancy_id);
    }
    throw err;
  }
  if (noteMessageId) {
    await supabase.from("messages").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", noteMessageId);
  }
  const now = new Date().toISOString();
  await supabase
    .from("candidate_vacancy")
    .update({ outreach_status: "invited", invited_at: now, ...(link.stage === "new" ? { stage: "contacted" as const } : {}) })
    .eq("candidate_id", cand.id)
    .eq("vacancy_id", link.vacancy_id);
  await supabase.from("candidates").update({ last_contacted_at: now }).eq("id", cand.id);
  await logActivity(supabase, {
    actor: "system",
    action: "invite_sent",
    entity: "candidate",
    entityId: cand.id,
    details: { vacancy_id: link.vacancy_id, campaign_id: link.campaign_id, with_note: Boolean(note) },
  });
  return `Uitnodiging ${note ? "met tekst" : "zonder tekst"} gestuurd aan ${cand.full_name}`;
}

// ---------------------------------------------------------------------------
// 3c. Nieuwe kandidaten zoeken voor een campagne
// ---------------------------------------------------------------------------

type CampaignRow = Awaited<ReturnType<typeof activeCampaignIds>>[number];

async function refillCampaign(supabase: Db, config: UnipileConfig, s: AppSettings, campaigns: CampaignRow[]): Promise<string | "wait" | null> {
  for (const c of campaigns) {
    if (c.search_exhausted) continue;
    const { count } = await supabase
      .from("candidate_vacancy")
      .select("candidate_id", { count: "exact", head: true })
      .eq("campaign_id", c.id)
      .eq("outreach_status", "pending");
    if ((count ?? 0) >= POOL_TARGET) continue;

    const slot = await takeSlot(supabase, s, "search", { campaign_id: c.id });
    if (!slot.ok) return "wait";

    const q = (c.search_query ?? {}) as { keywords?: string; title?: string; location_ids?: string[]; network_distance?: (1 | 2 | 3)[] };
    const result = await searchPeople(config, {
      keywords: q.keywords,
      title: q.title,
      locationIds: q.location_ids,
      networkDistance: q.network_distance,
      cursor: c.search_cursor,
    });
    await supabase.rpc("linkedin_record_search", {
      p_results: result.people.length,
      p_daily_limit: s.maxSearchResultsPerDay,
      p_details: { campaign_id: c.id } as Json,
    });
    await supabase
      .from("campaigns")
      .update({ search_cursor: result.cursor, search_exhausted: !result.cursor || result.people.length === 0 })
      .eq("id", c.id);

    // Afgemelde personen (hash-lijst) overslaan.
    const hashes = result.people.flatMap((p) => [dncHash(p.providerId), ...(p.profileUrl ? [dncHash(p.profileUrl)] : [])]);
    const { data: dnc } = hashes.length ? await supabase.from("do_not_contact").select("hash").in("hash", hashes) : { data: [] };
    const blocked = new Set((dnc ?? []).map((r) => r.hash));

    let added = 0;
    for (const p of result.people) {
      if (blocked.has(dncHash(p.providerId)) || (p.profileUrl && blocked.has(dncHash(p.profileUrl)))) continue;

      // Bestaande kandidaat? Dan alleen gebruiken als die nog nooit benaderd is.
      const { data: byId } = await supabase.from("candidates").select("id, status, last_contacted_at").eq("linkedin_provider_id", p.providerId).limit(1);
      let existing = byId?.[0];
      if (!existing && p.profileUrl) {
        const { data: byUrl } = await supabase.from("candidates").select("id, status, last_contacted_at").eq("linkedin_url", p.profileUrl).limit(1);
        existing = byUrl?.[0];
        if (existing) await supabase.from("candidates").update({ linkedin_provider_id: p.providerId }).eq("id", existing.id);
      }
      let candidateId: string;
      if (existing) {
        if (existing.status !== "active" || existing.last_contacted_at) continue;
        candidateId = existing.id;
      } else {
        const country = countryFromLocation(p.location);
        const { data: ins, error } = await supabase
          .from("candidates")
          .insert({
            full_name: p.name,
            linkedin_provider_id: p.providerId,
            linkedin_url: p.profileUrl,
            headline: p.headline || null,
            location: p.location || null,
            country,
            language: languageForCountry(country),
            source: "linkedin_search",
          })
          .select("id, status")
          .single();
        if (error || !ins || ins.status !== "active") continue;
        candidateId = ins.id;
        await logActivity(supabase, {
          actor: "system",
          action: "candidate_created",
          entity: "candidate",
          entityId: candidateId,
          details: { source: "linkedin_search", campaign_id: c.id, vacancy_id: c.vacancy_id },
        });
      }

      // Al eerder door een andere campagne benaderd? Niet nog eens.
      const { data: other } = await supabase
        .from("candidate_vacancy")
        .select("vacancy_id, outreach_status")
        .eq("candidate_id", candidateId)
        .not("outreach_status", "is", null);
      if (other?.some((o) => o.vacancy_id !== c.vacancy_id)) continue;

      const { error: linkError } = await supabase.from("candidate_vacancy").insert({
        candidate_id: candidateId,
        vacancy_id: c.vacancy_id,
        campaign_id: c.id,
        outreach_status: "pending",
        stage: "new",
      });
      if (linkError?.code === "23505") {
        await supabase
          .from("candidate_vacancy")
          .update({ campaign_id: c.id, outreach_status: "pending" })
          .eq("candidate_id", candidateId)
          .eq("vacancy_id", c.vacancy_id)
          .is("outreach_status", null);
      } else if (!linkError) {
        added++;
      }
    }
    return `${added} nieuwe kandidaten gevonden voor de campagne`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// De tik
// ---------------------------------------------------------------------------

export async function runOutreachTick(supabase: Db): Promise<TickReport> {
  const steps: string[] = [];
  const { config } = getUnipileConfig();
  if (!config) return { state: "error", steps, message: unipileSetupProblem() ?? "Unipile is niet ingesteld." };

  const campaigns = await activeCampaignIds(supabase);
  const { count: tracking } = await supabase
    .from("candidate_vacancy")
    .select("candidate_id", { count: "exact", head: true })
    .in("outreach_status", ["invited", "connected", "messaged", "replied"]);
  if (!campaigns.length && !tracking) return { state: "idle", steps, message: "Geen actieve campagnes." };

  const s = await loadSettings(supabase);
  const { data: withdrawRow } = await supabase.from("settings").select("value").eq("key", "withdraw_invite_after_days").maybeSingle();
  const withdrawAfterDays = typeof withdrawRow?.value === "number" ? withdrawRow.value : 21;

  try {
    // 1. Reacties (lezen): elke 5–12 minuten.
    if (await due(supabase, "chats_check", 300, 720)) steps.push(...(await checkReplies(supabase, config)));

    const work = checkWorkingHours(new Date(), s.schedule);
    if (!work.open) return { state: "paused", steps, message: work.reason };

    // 2. Connecties: een paar keer per dag, op willekeurige momenten (2–4 uur).
    if (await due(supabase, "relations_check", 7200, 14400)) steps.push(...(await checkConnections(supabase, config, withdrawAfterDays)));

    if (!campaigns.length) return { state: steps.length ? "done" : "idle", steps };
    const ids = campaigns.map((c) => c.id);

    // 3. Eén actie.
    for (const action of [
      () => sendNextMessage(supabase, config, s, ids),
      () => sendNextInvite(supabase, config, s, ids),
      () => refillCampaign(supabase, config, s, campaigns),
    ]) {
      const r = await action();
      if (r === "wait") return { state: "waiting", steps, message: "Wacht op pauze of daglimiet." };
      if (r) {
        steps.push(r);
        return { state: "done", steps };
      }
    }
    return { state: steps.length ? "done" : "idle", steps, message: "Niets te doen: alle kandidaten zijn benaderd of de zoekopdracht is op." };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("Automatisch benaderen:", message);
    await logActivity(supabase, { actor: "system", action: "outreach_error", entity: "system", details: { message } });
    return { state: "error", steps, message };
  }
}
