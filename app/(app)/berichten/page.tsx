import { MessageSquare } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Panel } from "@/components/ui/panel";

export const metadata = { title: "Berichten — Cr8las Recruitment" };

export default function BerichtenPage() {
  return (
    <Panel title="Berichten" subtitle="Concepten goedkeuren, verzonden berichten en reacties.">
      <EmptyState icon={MessageSquare} title="Nog geen berichten">
        In fase 5 verschijnen hier de concepten die je moet goedkeuren. Er gaat nooit iets weg zonder
        jouw goedkeuring.
      </EmptyState>
    </Panel>
  );
}
