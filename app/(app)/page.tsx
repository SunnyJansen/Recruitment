import { CircleCheck, CircleX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { StatGroup } from "@/components/ui/stat-group";
import { createClient } from "@/lib/db/server";
import type { Database } from "@/lib/db/types";

export const metadata = { title: "Dashboard — Cr8las Recruitment" };

type TableName = keyof Database["public"]["Tables"];
const TABLES: TableName[] = [
  "vacancies",
  "candidates",
  "candidate_vacancy",
  "messages",
  "follow_ups",
  "searches",
  "activity_log",
  "settings",
  "do_not_contact",
];

export default async function DashboardPage() {
  const supabase = await createClient();

  // Telt per tabel; een fout betekent meestal dat de migratie nog niet gedraaid is.
  const counts = await Promise.all(
    TABLES.map(async (table) => {
      const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
      return { table, count: count ?? 0, error: error?.message };
    }),
  );
  const byTable = Object.fromEntries(counts.map((c) => [c.table, c.count]));

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [{ count: drafts }, { count: sentToday }] = await Promise.all([
    supabase.from("messages").select("*", { count: "exact", head: true }).eq("status", "draft"),
    supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("status", "sent")
      .gte("sent_at", startOfDay.toISOString()),
  ]);

  const allOk = counts.every((c) => !c.error);

  return (
    <>
      <StatGroup
        items={[
          { label: "Wacht op goedkeuring", value: drafts ?? 0, note: "Conceptberichten" },
          { label: "Vacatures", value: byTable.vacancies },
          { label: "Kandidaten", value: byTable.candidates },
          { label: "Verstuurd vandaag", value: sentToday ?? 0 },
        ]}
      />

      <Panel
        title="Databasecontrole"
        subtitle="Fase 1: staan alle tabellen in Supabase?"
        actions={allOk ? <Badge tone="green">Alles in orde</Badge> : <Badge tone="red">Actie nodig</Badge>}
      >
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {counts.map((c) => (
            <li
              key={c.table}
              className="flex items-center gap-3 rounded-tile bg-surface-raised px-3.5 py-3"
            >
              {c.error ? (
                <CircleX className="size-4 shrink-0 text-danger-text" aria-label="Fout" />
              ) : (
                <CircleCheck className="size-4 shrink-0 text-success" aria-label="In orde" />
              )}
              <span className="font-mono text-[13px]">{c.table}</span>
              <span className="ml-auto text-app-meta text-muted-foreground tabular-nums">
                {c.error ? "ontbreekt" : `${c.count} rijen`}
              </span>
            </li>
          ))}
        </ul>
        {!allOk && (
          <p className="text-[13px] text-muted-foreground">
            Draai <code className="rounded bg-surface-raised px-1.5">supabase/migrations/20261106000000_fundament.sql</code>{" "}
            in de SQL Editor van Supabase en ververs deze pagina.
          </p>
        )}
      </Panel>
    </>
  );
}
