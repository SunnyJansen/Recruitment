import { notFound } from "next/navigation";

import { createClient } from "@/lib/db/server";
import { isUuid } from "@/lib/domain/form-state";
import { readRequirements } from "@/lib/domain/forms";

import { saveVacancy } from "../../actions";
import { VacancyForm } from "../../vacancy-form";

export const metadata = { title: "Vacature bewerken — Cr8las Recruitment" };

export default async function VacatureBewerkenPage({ params }: PageProps<"/vacatures/[id]/bewerken">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const { data: v } = await supabase.from("vacancies").select("*").eq("id", id).maybeSingle();
  if (!v) notFound();

  return (
    <VacancyForm
      action={saveVacancy.bind(null, id)}
      initial={{
        title: v.title,
        description: v.description ?? "",
        location: v.location ?? "",
        country: v.country,
        status: v.status,
        requirements: readRequirements(v.requirements),
      }}
      cancelHref={`/vacatures/${id}`}
      submitLabel="Bewaar wijzigingen"
    />
  );
}
