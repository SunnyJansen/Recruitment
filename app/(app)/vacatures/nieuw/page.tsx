import { EMPTY_REQUIREMENTS } from "@/lib/domain/forms";

import { saveVacancy } from "../actions";
import { VacancyForm } from "../vacancy-form";

export const metadata = { title: "Nieuwe vacature — Cr8las Recruitment" };

export default function NieuweVacaturePage() {
  return (
    <>
      <h2 className="sr-only">Nieuwe vacature</h2>
      <VacancyForm
        action={saveVacancy.bind(null, null)}
        initial={{ title: "", description: "", location: "", country: "NL", status: "open", requirements: EMPTY_REQUIREMENTS }}
        cancelHref="/vacatures"
        submitLabel="Bewaar vacature"
      />
    </>
  );
}
