import { notFound } from "next/navigation";

import { createClient } from "@/lib/db/server";
import { isUuid } from "@/lib/domain/form-state";
import { experienceToText } from "@/lib/domain/forms";

import { saveCandidate } from "../../actions";
import { CandidateForm } from "../../candidate-form";

export const metadata = { title: "Kandidaat bewerken — Cr8las Recruitment" };

export default async function KandidaatBewerkenPage({ params }: PageProps<"/kandidaten/[id]/bewerken">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const { data: c } = await supabase.from("candidates").select("*").eq("id", id).maybeSingle();
  if (!c || c.status === "anonymized") notFound();

  return (
    <CandidateForm
      action={saveCandidate.bind(null, id)}
      initial={{
        full_name: c.full_name,
        linkedin_url: c.linkedin_url ?? "",
        headline: c.headline ?? "",
        current_company: c.current_company ?? "",
        location: c.location ?? "",
        country: c.country ?? "",
        language: c.language,
        email: c.email ?? "",
        phone: c.phone ?? "",
        skills: c.skills.join(", "),
        experience: experienceToText(c.experience),
      }}
      cancelHref={`/kandidaten/${id}`}
      submitLabel="Bewaar wijzigingen"
    />
  );
}
