import { saveCandidate } from "../actions";
import { CandidateForm } from "../candidate-form";

export const metadata = { title: "Kandidaat toevoegen — Cr8las Recruitment" };

export default function NieuweKandidaatPage() {
  return (
    <>
      <h2 className="sr-only">Kandidaat toevoegen</h2>
      <CandidateForm
        action={saveCandidate.bind(null, null)}
        initial={{ country: "NL" }}
        cancelHref="/kandidaten"
        submitLabel="Bewaar kandidaat"
      />
    </>
  );
}
