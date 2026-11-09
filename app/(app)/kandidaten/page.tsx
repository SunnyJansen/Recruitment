import { Search, UserPlus, Users } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { createClient } from "@/lib/db/server";
import { CANDIDATE_STATUS, countryLabel, LANGUAGES } from "@/lib/domain/labels";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Kandidaten — Cr8las Recruitment" };

export default async function KandidatenPage({ searchParams }: PageProps<"/kandidaten">) {
  const params = await searchParams;
  // Zoekterm opschonen: komma's en haakjes hebben een betekenis in de zoekopdracht naar de database.
  const q = (typeof params.q === "string" ? params.q : "").replace(/[,()*%\\]/g, " ").trim().slice(0, 80);

  const supabase = await createClient();
  let query = supabase
    .from("candidates")
    .select("id, full_name, headline, current_company, location, country, language, status, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (q) query = query.or(`full_name.ilike.*${q}*,headline.ilike.*${q}*,current_company.ilike.*${q}*,location.ilike.*${q}*`);

  const [{ data: candidates, error }, { data: links }] = await Promise.all([
    query,
    supabase.from("candidate_vacancy").select("candidate_id"),
  ]);
  const counts = new Map<string, number>();
  for (const l of links ?? []) counts.set(l.candidate_id, (counts.get(l.candidate_id) ?? 0) + 1);

  return (
    <Panel
      title="Kandidaten"
      subtitle="Je eigen kandidatendatabase, zonder dubbelen."
      actions={
        <Button asChild variant="default">
          <Link href="/kandidaten/nieuw">
            <UserPlus />
            Kandidaat toevoegen
          </Link>
        </Button>
      }
    >
      <form role="search" className="flex max-w-md gap-2">
        <div className="relative flex-1">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Zoek op naam, functie, werkgever of plaats" aria-label="Zoeken" className="pl-9" />
        </div>
        <Button type="submit" variant="bordered">
          Zoek
        </Button>
      </form>

      {error ? (
        <p className="text-[13px] text-danger-text">Kandidaten laden is mislukt: {error.message}</p>
      ) : !candidates?.length ? (
        <EmptyState icon={Users} title={q ? `Niets gevonden voor "${q}"` : "Nog geen kandidaten"}>
          {q ? "Probeer een andere zoekterm." : "Voeg je eerste kandidaat toe met de knop rechtsboven."}
        </EmptyState>
      ) : (
        <Table className="min-w-[720px]">
          <THead>
            <TR>
              <TH>Naam</TH>
              <TH>Woonplaats</TH>
              <TH>Taal</TH>
              <TH>Status</TH>
              <TH align="end">Vacatures</TH>
              <TH align="end">Toegevoegd</TH>
            </TR>
          </THead>
          <TBody>
            {candidates.map((c) => (
              <TR key={c.id}>
                <TD>
                  <Link href={`/kandidaten/${c.id}`} className="font-semibold hover:text-accent-text hover:underline">
                    {c.full_name}
                  </Link>
                  {(c.headline || c.current_company) && (
                    <div className="text-app-meta text-muted-foreground">{c.headline ?? c.current_company}</div>
                  )}
                </TD>
                <TD muted>{[c.location, c.country ? countryLabel(c.country) : null].filter(Boolean).join(", ") || "—"}</TD>
                <TD muted>{LANGUAGES[c.language]}</TD>
                <TD>
                  <Badge tone={CANDIDATE_STATUS[c.status].tone}>{CANDIDATE_STATUS[c.status].label}</Badge>
                </TD>
                <TD align="end">{counts.get(c.id) ?? 0}</TD>
                <TD align="end" muted>
                  {formatDate(c.created_at)}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Panel>
  );
}
