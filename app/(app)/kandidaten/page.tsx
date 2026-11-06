import { Users } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Panel } from "@/components/ui/panel";

export const metadata = { title: "Kandidaten — Cr8las Recruitment" };

export default function KandidatenPage() {
  return (
    <Panel title="Kandidaten" subtitle="Je eigen kandidatendatabase, zonder dubbelen.">
      <EmptyState icon={Users} title="Nog geen kandidaten">
        In fase 2 voeg je kandidaten handmatig toe, in fase 3 importeer je ze van LinkedIn.
      </EmptyState>
    </Panel>
  );
}
