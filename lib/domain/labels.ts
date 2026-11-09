/**
 * Vaste keuzelijsten en Nederlandse labels. Eén plek, zodat lijsten,
 * formulieren en badges overal hetzelfde zeggen.
 */
import type { CandidateStatus, Stage, VacancyStatus } from "@/lib/db/types";

export type BadgeTone = "blue" | "green" | "red" | "gray";

export const VACANCY_STATUS: Record<VacancyStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: "Concept", tone: "gray" },
  open: { label: "Open", tone: "green" },
  paused: { label: "Gepauzeerd", tone: "gray" },
  closed: { label: "Gesloten", tone: "red" },
};

export const STAGES: Record<Stage, { label: string; tone: BadgeTone }> = {
  new: { label: "Nieuw", tone: "gray" },
  contacted: { label: "Benaderd", tone: "blue" },
  replied: { label: "Gereageerd", tone: "green" },
  interview: { label: "Gesprek", tone: "green" },
  placed: { label: "Geplaatst", tone: "green" },
  rejected: { label: "Afgewezen", tone: "red" },
  opted_out: { label: "Afgemeld", tone: "red" },
};

/** Fases die een recruiter zelf mag kiezen. "Afgemeld" gaat alleen via de afmeldknop. */
export const SELECTABLE_STAGES: Stage[] = ["new", "contacted", "replied", "interview", "placed", "rejected"];

export const CANDIDATE_STATUS: Record<CandidateStatus, { label: string; tone: BadgeTone }> = {
  active: { label: "Actief", tone: "blue" },
  opted_out: { label: "Afgemeld", tone: "red" },
  anonymized: { label: "Geanonimiseerd", tone: "gray" },
};

export const COUNTRIES: { code: string; label: string }[] = [
  { code: "NL", label: "Nederland" },
  { code: "ZA", label: "Zuid-Afrika" },
  { code: "BE", label: "België" },
  { code: "DE", label: "Duitsland" },
  { code: "PL", label: "Polen" },
  { code: "PT", label: "Portugal" },
  { code: "OTHER", label: "Ander land" },
];

export function countryLabel(code: string | null | undefined) {
  if (!code) return "—";
  return COUNTRIES.find((c) => c.code === code)?.label ?? code;
}

export const LANGUAGES = { nl: "Nederlands", en: "Engels" } as const;

export const WELDING_PROCESSES = [
  "TIG (141)",
  "MIG (131)",
  "MAG (135)",
  "Gevulde draad (136/138)",
  "Elektrode (111)",
  "Onder poeder (121)",
  "Autogeen (311)",
  "Orbitaal",
] as const;

export const MATERIALS = ["Staal", "RVS", "Aluminium", "Duplex", "Koper", "Titanium"] as const;

export const OUTREACH_STATUS: Record<
  "pending" | "invited" | "connected" | "messaged" | "replied" | "failed" | "skipped",
  { label: string; tone: BadgeTone }
> = {
  pending: { label: "Klaar om uit te nodigen", tone: "gray" },
  invited: { label: "Uitgenodigd", tone: "blue" },
  connected: { label: "Verbonden", tone: "blue" },
  messaged: { label: "Bericht gestuurd", tone: "blue" },
  replied: { label: "Gereageerd", tone: "green" },
  failed: { label: "Mislukt", tone: "red" },
  skipped: { label: "Overgeslagen", tone: "gray" },
};

export const ENGINE_STATE: Record<string, { label: string; tone: BadgeTone }> = {
  done: { label: "Actie uitgevoerd", tone: "green" },
  waiting: { label: "Wacht", tone: "blue" },
  paused: { label: "Gepauzeerd", tone: "gray" },
  idle: { label: "Niets te doen", tone: "gray" },
  error: { label: "Fout", tone: "red" },
};
