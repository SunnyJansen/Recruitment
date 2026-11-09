"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/db/admin";
import { logActivity } from "@/lib/db/log";
import { createClient, getCurrentUser } from "@/lib/db/server";
import type { CampaignQuery, Json } from "@/lib/db/types";
import { isUuid } from "@/lib/domain/form-state";
import { checkInviteNote, checkTemplate } from "@/lib/domain/templates";
import { loadSettings } from "@/lib/settings";
import { runOutreachTick, type TickReport } from "@/lib/queue/outreach";

export type CampaignInput = {
  query: CampaignQuery;
  templateNl: string;
  templateEn: string;
  inviteNoteNl: string;
  inviteNoteEn: string;
};

export type CampaignResult = { ok: boolean; message?: string; problems?: string[] };

function cleanQuery(q: CampaignQuery): CampaignQuery {
  const ids = (q.location_ids ?? []).filter((id) => /^\d+$/.test(id)).slice(0, 10);
  return {
    keywords: (q.keywords ?? "").trim().slice(0, 200) || undefined,
    title: (q.title ?? "").trim().slice(0, 200) || undefined,
    location_ids: ids,
    location_labels: (q.location_labels ?? []).slice(0, ids.length).map((l) => String(l).slice(0, 120)),
    network_distance: (q.network_distance ?? []).filter((d) => d === 1 || d === 2 || d === 3),
  };
}

/** Opslaan als concept. Gewijzigde tekst of zoekopdracht → goedkeuring vervalt (database). */
export async function saveCampaign(vacancyId: string, input: CampaignInput): Promise<CampaignResult> {
  if (!isUuid(vacancyId)) return { ok: false, message: "Onbekende vacature." };
  const supabase = await createClient();
  const user = await getCurrentUser();
  const row = {
    vacancy_id: vacancyId,
    search_query: cleanQuery(input.query) as unknown as Json,
    template_nl: input.templateNl.replace(/\r\n/g, "\n").trim(),
    template_en: input.templateEn.replace(/\r\n/g, "\n").trim(),
    invite_note_nl: input.inviteNoteNl.replace(/\s+/g, " ").trim(),
    invite_note_en: input.inviteNoteEn.replace(/\s+/g, " ").trim(),
  };
  const { data: existing } = await supabase.from("campaigns").select("id").eq("vacancy_id", vacancyId).maybeSingle();
  const { error } = existing
    ? await supabase.from("campaigns").update(row).eq("id", existing.id)
    : await supabase.from("campaigns").insert(row);
  if (error) {
    console.error("Campagne opslaan mislukt:", error);
    return { ok: false, message: "Opslaan is mislukt." };
  }
  await logActivity(supabase, { actor: "user", actorId: user?.id, action: "campaign_saved", entity: "vacancy", entityId: vacancyId });
  revalidatePath(`/vacatures/${vacancyId}/automatisch`);
  return { ok: true, message: "Opgeslagen." };
}

/** Goedkeuren en starten. Controleert eerst de AVG-eisen aan de teksten. */
export async function approveCampaign(vacancyId: string, input: CampaignInput): Promise<CampaignResult> {
  if (!isUuid(vacancyId)) return { ok: false, message: "Onbekende vacature." };
  const query = cleanQuery(input.query);
  const supabaseForCheck = await createClient();
  const [{ data: vacancy }, { data: senderRows }, settings] = await Promise.all([
    supabaseForCheck.from("vacancies").select("title, location").eq("id", vacancyId).maybeSingle(),
    supabaseForCheck.from("settings").select("key, value").in("key", ["sender_name", "sender_title", "company_name"]),
    loadSettings(supabaseForCheck),
  ]);
  const senderSetting = (k: string) => {
    const val = senderRows?.find((r) => r.key === k)?.value;
    return typeof val === "string" ? val : "";
  };
  const vars = {
    fullName: "",
    vacancyTitle: vacancy?.title ?? "",
    vacancyLocation: vacancy?.location ?? null,
    language: "nl" as const,
    senderName: senderSetting("sender_name"),
    senderTitle: senderSetting("sender_title"),
    companyName: senderSetting("company_name"),
  };
  const problems = [
    ...checkInviteNote(input.inviteNoteNl, "nl", settings.inviteNoteMaxChars, vars),
    ...checkInviteNote(input.inviteNoteEn, "en", settings.inviteNoteMaxChars, vars),
    ...checkTemplate(input.templateNl, "nl"),
    ...checkTemplate(input.templateEn, "en"),
  ];
  if (!query.keywords && !query.title && !query.location_ids?.length) {
    problems.push("Vul bij de zoekopdracht minstens trefwoorden, een functie of een locatie in.");
  }
  if (problems.length) return { ok: false, message: "Nog niet klaar om te starten.", problems };

  const saved = await saveCampaign(vacancyId, input);
  if (!saved.ok) return saved;

  const supabase = await createClient();
  const user = await getCurrentUser();
  const label = user?.passwordMode ? "Teamwachtwoord (testmodus)" : (user?.email ?? "Onbekend");
  const { error } = await supabase
    .from("campaigns")
    .update({ approved_at: new Date().toISOString(), approved_by_label: label, status: "active" })
    .eq("vacancy_id", vacancyId);
  if (error) {
    console.error("Goedkeuren mislukt:", error);
    return { ok: false, message: `Goedkeuren is mislukt: ${error.message}` };
  }
  await logActivity(supabase, {
    actor: "user",
    actorId: user?.id,
    action: "campaign_approved",
    entity: "vacancy",
    entityId: vacancyId,
    details: {
      approved_by: label,
      invite_note_nl: input.inviteNoteNl,
      invite_note_en: input.inviteNoteEn,
      template_nl: input.templateNl,
      template_en: input.templateEn,
      query: query as unknown as Json,
    },
  });
  revalidatePath(`/vacatures/${vacancyId}/automatisch`);
  return { ok: true, message: "Goedgekeurd en gestart." };
}

/** Pauzeren of hervatten. Hervatten kan alleen met een geldige goedkeuring (database). */
export async function setCampaignActive(vacancyId: string, active: boolean): Promise<CampaignResult> {
  if (!isUuid(vacancyId)) return { ok: false, message: "Onbekende vacature." };
  const supabase = await createClient();
  const user = await getCurrentUser();
  const { error } = await supabase.from("campaigns").update({ status: active ? "active" : "paused" }).eq("vacancy_id", vacancyId);
  if (error) return { ok: false, message: active ? "Hervatten kan pas na opnieuw goedkeuren." : "Pauzeren is mislukt." };
  await logActivity(supabase, {
    actor: "user",
    actorId: user?.id,
    action: active ? "campaign_resumed" : "campaign_paused",
    entity: "vacancy",
    entityId: vacancyId,
  });
  revalidatePath(`/vacatures/${vacancyId}/automatisch`);
  return { ok: true };
}

/** Testknop: één tik van de automatische motor, zoals de cron die doet (zelfde limieten). */
export async function runTickNow(): Promise<TickReport> {
  const user = await getCurrentUser();
  if (!user) return { state: "error", steps: [], message: "Niet ingelogd." };
  const admin = createAdminClient();
  if (!admin) return { state: "error", steps: [], message: "SUPABASE_SERVICE_ROLE_KEY ontbreekt in Vercel." };
  return runOutreachTick(admin);
}
