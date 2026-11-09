import { CircleCheck, CircleX, MessageSquareReply } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { StatGroup } from "@/components/ui/stat-group";
import { createClient } from "@/lib/db/server";
import type { Database } from "@/lib/db/types";
import { STAGES } from "@/lib/domain/labels";
import { daysAgoIso, formatDateTime } from "@/lib/format";

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

  // Reacties van kandidaten: dit is wat de recruiter te zien krijgt.
  const { data: replied } = await supabase
    .from("candidate_vacancy")
    .select("candidate_id, vacancy_id, stage, replied_at")
    .not("replied_at", "is", null)
    .order("replied_at", { ascending: false })
    .limit(30);
  const candIds = [...new Set((replied ?? []).map((r) => r.candidate_id))];
  const vacIds = [...new Set((replied ?? []).map((r) => r.vacancy_id))];
  const weekAgo = daysAgoIso(7);

  const [{ data: cands }, { data: vacs }, { data: lastIn }, { count: activeCampaigns }, { data: invitesToday }, { data: messagesToday }, ...tableCounts] =
    await Promise.all([
      candIds.length ? supabase.from("candidates").select("id, full_name, headline, location, status").in("id", candIds) : Promise.resolve({ data: [] as { id: string; full_name: string; headline: string | null; location: string | null; status: string }[] }),
      vacIds.length ? supabase.from("vacancies").select("id, title").in("id", vacIds) : Promise.resolve({ data: [] as { id: string; title: string }[] }),
      candIds.length
        ? supabase.from("messages").select("candidate_id, body, created_at, reply_category").eq("direction", "in").in("candidate_id", candIds).order("created_at", { ascending: false }).limit(100)
        : Promise.resolve({ data: [] as { candidate_id: string; body: string; created_at: string; reply_category: string | null }[] }),
      supabase.from("campaigns").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase.rpc("linkedin_count", { p_kind: "invite", p_period: "day" }),
      supabase.rpc("linkedin_count", { p_kind: "message", p_period: "day" }),
      ...TABLES.map(async (table) => {
        const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
        return { table, count: count ?? 0, error: error?.message };
      }),
    ]);
  const counts = tableCounts as { table: TableName; count: number; error?: string }[];
  const byTable = Object.fromEntries(counts.map((c) => [c.table, c.count]));
  const allOk = counts.every((c) => !c.error);
  const candById = new Map((cands ?? []).map((c) => [c.id, c]));
  const vacById = new Map((vacs ?? []).map((v) => [v.id, v]));
  const lastMessage = new Map<string, { body: string; reply_category: string | null }>();
  for (const m of lastIn ?? []) if (!lastMessage.has(m.candidate_id)) lastMessage.set(m.candidate_id, m);
  const newThisWeek = (replied ?? []).filter((r) => r.replied_at && r.replied_at >= weekAgo).length;

  return (
    <>
      <StatGroup
        items={[
          { label: "Nieuwe reacties", value: newThisWeek, note: "Afgelopen 7 dagen" },
          { label: "Actieve campagnes", value: activeCampaigns ?? 0 },
          { label: "Uitgenodigd vandaag", value: invitesToday ?? 0 },
          { label: "Kandidaten", value: byTable.candidates, note: `${messagesToday ?? 0} berichten vandaag` },
        ]}
      />

      <Panel title="Reacties" subtitle="Kandidaten die gereageerd hebben op een bericht. Nieuwste bovenaan.">
        {!replied?.length ? (
          <EmptyState icon={MessageSquareReply} title="Nog geen reacties">
            Zet bij een vacature &quot;Automatisch benaderen&quot; aan. Zodra een kandidaat reageert, verschijnt die hier.
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-2">
            {replied.map((r) => {
              const c = candById.get(r.candidate_id);
              const v = vacById.get(r.vacancy_id);
              const m = lastMessage.get(r.candidate_id);
              const optedOut = c?.status === "opted_out" || m?.reply_category === "opt_out";
              return (
                <li key={`${r.candidate_id}-${r.vacancy_id}`}>
                  <Link
                    href={`/kandidaten/${r.candidate_id}`}
                    className="flex flex-col gap-1 rounded-tile bg-surface-raised px-4 py-3 outline-none transition-colors hover:bg-[color-mix(in_srgb,var(--surface-raised),var(--text-strong)_6%)] focus-visible:ring-[3px] focus-visible:ring-ring"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{c?.full_name ?? "Onbekend"}</span>
                      <span className="text-app-meta text-muted-foreground">· {v?.title ?? "Vacature"}</span>
                      <span className="ml-auto flex items-center gap-2">
                        {optedOut ? <Badge tone="red">Geen interesse</Badge> : <Badge tone={STAGES[r.stage].tone}>{STAGES[r.stage].label}</Badge>}
                        <span className="text-app-meta text-muted-foreground">{formatDateTime(r.replied_at)}</span>
                      </span>
                    </div>
                    {m && <p className="line-clamp-2 text-[13px] text-muted-foreground">&ldquo;{m.body}&rdquo;</p>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel
        title="Databasecontrole"
        subtitle="Staan alle tabellen in Supabase?"
        actions={allOk ? <Badge tone="green">Alles in orde</Badge> : <Badge tone="red">Actie nodig</Badge>}
      >
        {allOk ? (
          <p className="text-[13px] text-muted-foreground">
            Alle {counts.length} tabellen gevonden · {byTable.vacancies} vacatures · {byTable.candidates} kandidaten.
          </p>
        ) : (
          <>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {counts.map((c) => (
                <li key={c.table} className="flex items-center gap-3 rounded-tile bg-surface-raised px-3.5 py-3">
                  {c.error ? (
                    <CircleX className="size-4 shrink-0 text-danger-text" aria-label="Fout" />
                  ) : (
                    <CircleCheck className="size-4 shrink-0 text-success" aria-label="In orde" />
                  )}
                  <span className="font-mono text-[13px]">{c.table}</span>
                  <span className="ml-auto text-app-meta text-muted-foreground tabular-nums">{c.error ? "ontbreekt" : `${c.count} rijen`}</span>
                </li>
              ))}
            </ul>
            <p className="text-[13px] text-muted-foreground">Voer de ontbrekende migraties uit de map supabase/migrations uit in de SQL Editor van Supabase.</p>
          </>
        )}
      </Panel>
    </>
  );
}
