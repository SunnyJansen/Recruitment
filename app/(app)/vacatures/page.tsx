import { Briefcase, Plus } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { createClient } from "@/lib/db/server";
import { countryLabel, VACANCY_STATUS } from "@/lib/domain/labels";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Vacatures — Cr8las Recruitment" };

export default async function VacaturesPage() {
  const supabase = await createClient();
  const [{ data: vacancies, error }, { data: links }] = await Promise.all([
    supabase.from("vacancies").select("id, title, location, country, status, created_at").order("created_at", { ascending: false }),
    supabase.from("candidate_vacancy").select("vacancy_id"),
  ]);

  const counts = new Map<string, number>();
  for (const l of links ?? []) counts.set(l.vacancy_id, (counts.get(l.vacancy_id) ?? 0) + 1);

  return (
    <Panel
      title="Vacatures"
      subtitle="Lasvacatures in Nederland en Zuid-Afrika."
      actions={
        <Button asChild variant="default">
          <Link href="/vacatures/nieuw">
            <Plus />
            Nieuwe vacature
          </Link>
        </Button>
      }
    >
      {error ? (
        <p className="text-[13px] text-danger-text">Vacatures laden is mislukt: {error.message}</p>
      ) : !vacancies?.length ? (
        <EmptyState icon={Briefcase} title="Nog geen vacatures">
          Maak je eerste vacature aan met de knop rechtsboven.
        </EmptyState>
      ) : (
        <Table className="min-w-[640px]">
          <THead>
            <TR>
              <TH>Functie</TH>
              <TH>Locatie</TH>
              <TH>Status</TH>
              <TH align="end">Kandidaten</TH>
              <TH align="end">Aangemaakt</TH>
            </TR>
          </THead>
          <TBody>
            {vacancies.map((v) => (
              <TR key={v.id}>
                <TD>
                  <Link href={`/vacatures/${v.id}`} className="font-semibold hover:text-accent-text hover:underline">
                    {v.title}
                  </Link>
                </TD>
                <TD muted>{[v.location, countryLabel(v.country)].filter(Boolean).join(", ")}</TD>
                <TD>
                  <Badge tone={VACANCY_STATUS[v.status].tone}>{VACANCY_STATUS[v.status].label}</Badge>
                </TD>
                <TD align="end">{counts.get(v.id) ?? 0}</TD>
                <TD align="end" muted>
                  {formatDate(v.created_at)}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Panel>
  );
}
