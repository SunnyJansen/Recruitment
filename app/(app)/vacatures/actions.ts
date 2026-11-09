"use server";

import { redirect } from "next/navigation";

import { logActivity } from "@/lib/db/log";
import { createClient, getCurrentUser } from "@/lib/db/server";
import type { Json } from "@/lib/db/types";
import { type FormState, isUuid } from "@/lib/domain/form-state";
import { formDataToInput, parseVacancyForm } from "@/lib/domain/forms";

/** Nieuwe vacature opslaan (id = null) of een bestaande bijwerken. */
export async function saveVacancy(id: string | null, prev: FormState, fd: FormData): Promise<FormState> {
  const input = formDataToInput(fd);
  const attempt = (prev.attempt ?? 0) + 1;
  const parsed = parseVacancyForm(input);
  if (!parsed.ok) {
    return { errors: parsed.errors, values: input, attempt, message: "Controleer de rood gemarkeerde velden." };
  }
  if (id !== null && !isUuid(id)) return { errors: {}, message: "Onbekende vacature.", values: input, attempt };

  const supabase = await createClient();
  const user = await getCurrentUser();
  const row = { ...parsed.data, requirements: parsed.data.requirements as unknown as Json };

  const result = id
    ? await supabase.from("vacancies").update(row).eq("id", id).select("id").single()
    : await supabase.from("vacancies").insert(row).select("id").single();

  if (result.error || !result.data) {
    console.error("Vacature opslaan mislukt:", result.error);
    return { errors: {}, values: input, attempt, message: "Opslaan is mislukt. Probeer het opnieuw." };
  }

  await logActivity(supabase, {
    actor: "user",
    actorId: user?.id,
    action: id ? "vacancy_updated" : "vacancy_created",
    entity: "vacancy",
    entityId: result.data.id,
    details: { title: parsed.data.title },
  });
  redirect(`/vacatures/${result.data.id}`);
}
