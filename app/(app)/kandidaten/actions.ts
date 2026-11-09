"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logActivity } from "@/lib/db/log";
import { createClient, getCurrentUser } from "@/lib/db/server";
import type { Json, Stage } from "@/lib/db/types";
import { type FormState, isUuid } from "@/lib/domain/form-state";
import { formDataToInput, parseCandidateForm } from "@/lib/domain/forms";
import { SELECTABLE_STAGES } from "@/lib/domain/labels";

export type ActionResult = { ok: boolean; message?: string };

/** Nieuwe kandidaat opslaan (id = null) of een bestaande bijwerken. Geen dubbelen. */
export async function saveCandidate(id: string | null, prev: FormState, fd: FormData): Promise<FormState> {
  const input = formDataToInput(fd);
  const attempt = (prev.attempt ?? 0) + 1;
  const parsed = parseCandidateForm(input);
  if (!parsed.ok) {
    return { errors: parsed.errors, values: input, attempt, message: "Controleer de rood gemarkeerde velden." };
  }
  if (id !== null && !isUuid(id)) return { errors: {}, message: "Onbekende kandidaat.", values: input, attempt };

  const supabase = await createClient();
  const user = await getCurrentUser();
  const data = parsed.data;

  // Dubbelen voorkomen: zelfde LinkedIn-profiel of zelfde e-mailadres.
  for (const [field, value, label] of [
    ["linkedin_url", data.linkedin_url, "LinkedIn-profiel"],
    ["email", data.email, "e-mailadres"],
  ] as const) {
    if (!value) continue;
    let query = supabase.from("candidates").select("id, full_name").eq(field, value).limit(1);
    if (id) query = query.neq("id", id);
    const { data: existing } = await query;
    if (existing && existing.length > 0) {
      return {
        errors: { [field]: `Er bestaat al een kandidaat met dit ${label}: ${existing[0].full_name}.` },
        values: input,
        attempt,
        duplicateId: existing[0].id,
        message: "Deze kandidaat staat al in de database.",
      };
    }
  }

  const row = { ...data, experience: data.experience as unknown as Json };
  const result = id
    ? await supabase.from("candidates").update(row).eq("id", id).select("id, status").single()
    : await supabase.from("candidates").insert({ ...row, source: "manual" }).select("id, status").single();

  if (result.error || !result.data) {
    if (result.error?.code === "23505") {
      return {
        errors: { linkedin_url: "Er bestaat al een kandidaat met dit LinkedIn-profiel." },
        values: input,
        attempt,
        message: "Deze kandidaat staat al in de database.",
      };
    }
    console.error("Kandidaat opslaan mislukt:", result.error);
    return { errors: {}, values: input, attempt, message: "Opslaan is mislukt. Probeer het opnieuw." };
  }

  await logActivity(supabase, {
    actor: "user",
    actorId: user?.id,
    action: id ? "candidate_updated" : "candidate_created",
    entity: "candidate",
    entityId: result.data.id,
    details: {
      source: id ? undefined : "manual",
      // Stond deze persoon op de niet-benaderen-lijst? Dan zette de database hem direct op afgemeld.
      matched_do_not_contact: !id && result.data.status === "opted_out" ? true : undefined,
    },
  });
  redirect(`/kandidaten/${result.data.id}`);
}

/** Kandidaat aan een vacature koppelen (stage "nieuw"). */
export async function linkCandidateToVacancy(candidateId: string, vacancyId: string): Promise<ActionResult> {
  if (!isUuid(candidateId) || !isUuid(vacancyId)) return { ok: false, message: "Kies een kandidaat en een vacature." };
  const supabase = await createClient();
  const user = await getCurrentUser();

  const { data: candidate } = await supabase.from("candidates").select("status").eq("id", candidateId).single();
  if (!candidate) return { ok: false, message: "Kandidaat niet gevonden." };
  if (candidate.status !== "active") {
    return { ok: false, message: "Deze kandidaat is afgemeld of geanonimiseerd en mag niet benaderd worden." };
  }

  const { data: vacancy } = await supabase.from("vacancies").select("title").eq("id", vacancyId).single();
  if (!vacancy) return { ok: false, message: "Vacature niet gevonden." };

  const { error } = await supabase
    .from("candidate_vacancy")
    .insert({ candidate_id: candidateId, vacancy_id: vacancyId, stage: "new", stage_changed_by: user?.id ?? null });
  if (error) {
    if (error.code === "23505") return { ok: false, message: "Deze kandidaat is al aan deze vacature gekoppeld." };
    console.error("Koppelen mislukt:", error);
    return { ok: false, message: "Koppelen is mislukt. Probeer het opnieuw." };
  }

  await logActivity(supabase, {
    actor: "user",
    actorId: user?.id,
    action: "linked_to_vacancy",
    entity: "candidate",
    entityId: candidateId,
    details: { vacancy_id: vacancyId, vacancy_title: vacancy.title },
  });
  revalidatePath(`/kandidaten/${candidateId}`);
  revalidatePath(`/vacatures/${vacancyId}`);
  return { ok: true };
}

/** Fase van een kandidaat binnen een vacature wijzigen. Altijd een menselijke beslissing. */
export async function setStage(candidateId: string, vacancyId: string, stage: Stage): Promise<ActionResult> {
  if (!isUuid(candidateId) || !isUuid(vacancyId)) return { ok: false, message: "Onbekende koppeling." };
  if (!SELECTABLE_STAGES.includes(stage)) return { ok: false, message: "Deze fase kun je niet zelf kiezen." };

  const supabase = await createClient();
  const user = await getCurrentUser();

  const { data: link } = await supabase
    .from("candidate_vacancy")
    .select("stage")
    .eq("candidate_id", candidateId)
    .eq("vacancy_id", vacancyId)
    .single();
  if (!link) return { ok: false, message: "Koppeling niet gevonden." };
  if (link.stage === "opted_out") return { ok: false, message: "Afgemelde kandidaten kun je niet meer verplaatsen." };
  if (link.stage === stage) return { ok: true };

  const { error } = await supabase
    .from("candidate_vacancy")
    .update({ stage, stage_changed_by: user?.id ?? null })
    .eq("candidate_id", candidateId)
    .eq("vacancy_id", vacancyId);
  if (error) {
    console.error("Fase wijzigen mislukt:", error);
    return { ok: false, message: "Opslaan is mislukt." };
  }

  const { data: vacancy } = await supabase.from("vacancies").select("title").eq("id", vacancyId).single();
  await logActivity(supabase, {
    actor: "user",
    actorId: user?.id,
    action: "stage_changed",
    entity: "candidate",
    entityId: candidateId,
    details: { vacancy_id: vacancyId, vacancy_title: vacancy?.title ?? null, from: link.stage, to: stage },
  });
  revalidatePath(`/kandidaten/${candidateId}`);
  revalidatePath(`/vacatures/${vacancyId}`);
  return { ok: true };
}

/**
 * Kandidaat afmelden: nooit meer benaderen (AVG). De database zet daarna
 * alle koppelingen op "afgemeld", annuleert concepten en opvolging en zet de
 * persoon (als hash) op de niet-benaderen-lijst.
 */
export async function optOutCandidate(candidateId: string): Promise<ActionResult> {
  if (!isUuid(candidateId)) return { ok: false, message: "Onbekende kandidaat." };
  const supabase = await createClient();
  const user = await getCurrentUser();

  const { error } = await supabase
    .from("candidates")
    .update({ status: "opted_out" })
    .eq("id", candidateId)
    .eq("status", "active");
  if (error) {
    console.error("Afmelden mislukt:", error);
    return { ok: false, message: "Afmelden is mislukt." };
  }

  await logActivity(supabase, {
    actor: "user",
    actorId: user?.id,
    action: "opted_out",
    entity: "candidate",
    entityId: candidateId,
    details: { reason: "handmatig door recruiter" },
  });
  revalidatePath(`/kandidaten/${candidateId}`);
  return { ok: true };
}
