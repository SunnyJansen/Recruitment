import { Briefcase } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Panel } from "@/components/ui/panel";

export const metadata = { title: "Vacatures — Cr8las Recruitment" };

export default function VacaturesPage() {
  return (
    <Panel title="Vacatures" subtitle="Lasvacatures in Nederland en Zuid-Afrika.">
      <EmptyState icon={Briefcase} title="Nog geen vacatures">
        In fase 2 kun je hier vacatures aanmaken en bewerken.
      </EmptyState>
    </Panel>
  );
}
