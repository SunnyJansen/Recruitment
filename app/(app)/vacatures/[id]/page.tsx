import { Pencil, Search, Send, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { LinkPicker } from "@/components/recruitment/link-picker";
import { StageSelect } from "@/components/recruitment/stage-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { createClient } from "@/lib/db/server";
import { isUuid } from "@/lib/domain/form-state";
import { readRequirements } from "@/lib/domain/forms";
import { countryLabel, VACANCY_STATUS } from "@/lib/domain/labels";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Vacature — Cr8las Recruitment" };

function Req({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-field-label text-muted-foreground">{label}</dt>
      <dd className="text-app-body">{value || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

function Chips({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <span key={i} className="inline-flex h-6 items-center rounded-full bg-surface-raised px-2.5 text-[12px] font-medium">
          {i}
        </span>
      ))}
    </span>
  );
}

export default async function VacaturePage({ params, searchParams }: PageProps<"/vacatures/[id]">) {
  const { id } = await params;
  const showAll = (await searchParams).toon === "alle";
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const { data: v } = await supabase.from("vacancies").select("*").eq("id", id).maybeSingle();
  if (!v) notFound();

  const { data: links } = await supabase
    .from("candidate_vacancy")
    .select("candidate_id, stage, created_at, match_score, outreach_status, replied_at")
    .eq("vacancy_id", id)
    .order("created_at", { ascending: false });

  const linkedIds = (links ?? []).map((l) => l.candidate_id);
  // Automatisch benaderde kandidaten pas tonen als ze gereageerd hebben (tenzij "toon alle").
  const inProgress = (links ?? []).filter((l) => l.outreach_status && !l.replied_at && l.stage !== "opted_out");
  const visibleLinks = showAll ? (links ?? []) : (links ?? []).filter((l) => !inProgress.includes(l));
  const [{ data: linkedCandidates }, { data: activeCandidates }] = await Promise.all([
    linkedIds.length
      ? supabase.from("candidates").select("id, full_name, location, country, headline").in("id", linkedIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string; location: string | null; country: string | null; headline: string | null }[] }),
    supabase.from("candidates").select("id, full_name, location").eq("status", "active").order("full_name"),
  ]);
  const byId = new Map((linkedCandidates ?? []).map((c) => [c.id, c]));
  const linkable = (activeCandidates ?? [])
    .filter((c) => !linkedIds.includes(c.id))
    .map((c) => ({ id: c.id, label: c.location ? `${c.full_name} (${c.location})` : c.full_name }));

  const { count: openImports } = await supabase
    .from("import_queue")
    .select("id", { count: "exact", head: true })
    .eq("vacancy_id", id)
    .in("status", ["pending", "processing"]);

  const r = readRequirements(v.requirements);
  const status = VACANCY_STATUS[v.status];

  return (
    <>
      <Panel
        title={v.title}
        subtitle={`${[v.location, countryLabel(v.country)].filter(Boolean).join(", ")} · aangemaakt ${formatDate(v.created_at)}`}
        actions={
          <>
            <Badge tone={status.tone}>{status.label}</Badge>
            <Button asChild variant="bordered">
              <Link href={`/vacatures/${id}/bewerken`}>
                <Pencil />
                Bewerken
              </Link>
            </Button>
            <Button asChild variant="bordered">
              <Link href={`/vacatures/${id}/automatisch`}>
                <Send />
                Automatisch benaderen
              </Link>
            </Button>
            <Button asChild variant="default">
              <Link href={`/vacatures/${id}/zoeken`}>
                <Search />
                Zoek op LinkedIn
              </Link>
            </Button>
          </>
        }
      >
        {(openImports ?? 0) > 0 && (
          <p role="status" className="flex flex-wrap items-center gap-2 rounded-tile bg-accent-tint px-4 py-3 text-[13px] text-accent-text">
            Er staan nog {openImports} LinkedIn-profielen in de importwachtrij.
            <Link href={`/vacatures/${id}/import`} className="font-semibold underline">
              Ga verder met importeren
            </Link>
          </p>
        )}
        {v.description && <p className="max-w-3xl text-app-body whitespace-pre-line text-muted-foreground">{v.description}</p>}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Panel title="Eisen">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Req label="Lasprocessen" value={<Chips items={r.lasprocessen} />} />
            <Req label="Materialen" value={<Chips items={r.materialen} />} />
            <Req label="Verplichte vaardigheden" value={r.verplichte_skills.join(", ")} />
            <Req label="Gewenste vaardigheden" value={r.gewenste_skills.join(", ")} />
            <Req label="Certificaten" value={r.certificaten.join(", ")} />
            <Req label="Talen" value={r.talen.join(", ")} />
            <Req label="Min. jaren ervaring" value={r.min_jaren_ervaring ?? ""} />
            <Req label="Max. reisafstand" value={r.max_reisafstand_km != null ? `${r.max_reisafstand_km} km` : ""} />
            <Req label="Opleiding" value={r.opleiding} />
            <Req label="Salarisindicatie" value={r.salaris} />
          </dl>
        </Panel>

        <Panel
          title="Kandidaten"
          subtitle={
            inProgress.length && !showAll
              ? `${visibleLinks.length} getoond · ${inProgress.length} worden automatisch benaderd en verschijnen hier zodra ze reageren`
              : `${links?.length ?? 0} gekoppeld`
          }
          actions={
            inProgress.length > 0 && (
              <Button asChild variant="borderless" size="sm">
                <Link href={showAll ? `/vacatures/${id}` : `/vacatures/${id}?toon=alle`}>{showAll ? "Alleen reacties" : `Toon alle (${links?.length ?? 0})`}</Link>
              </Button>
            )
          }
        >
          {visibleLinks.length ? (
            <Table className="min-w-[480px]">
              <THead>
                <TR>
                  <TH>Naam</TH>
                  <TH>Locatie</TH>
                  <TH>Fase</TH>
                  <TH align="end">Gekoppeld</TH>
                </TR>
              </THead>
              <TBody>
                {visibleLinks.map((l) => {
                  const c = byId.get(l.candidate_id);
                  return (
                    <TR key={l.candidate_id}>
                      <TD>
                        <Link href={`/kandidaten/${l.candidate_id}`} className="font-semibold hover:text-accent-text hover:underline">
                          {c?.full_name ?? "Onbekend"}
                        </Link>
                        {c?.headline && <div className="text-app-meta text-muted-foreground">{c.headline}</div>}
                      </TD>
                      <TD muted>{c?.location ?? "—"}</TD>
                      <TD>
                        <StageSelect
                          candidateId={l.candidate_id}
                          vacancyId={id}
                          stage={l.stage}
                          label={`Fase van ${c?.full_name ?? "kandidaat"}`}
                        />
                      </TD>
                      <TD align="end" muted>
                        {formatDate(l.created_at)}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          ) : (
            <EmptyState icon={Users} title="Nog geen kandidaten gekoppeld">
              Koppel hieronder een kandidaat uit de database.
            </EmptyState>
          )}
          <LinkPicker
            fixed="vacancy"
            fixedId={id}
            options={linkable}
            label="Kandidaat koppelen"
            emptyText="Alle actieve kandidaten zijn al gekoppeld. Voeg nieuwe kandidaten toe via Kandidaten."
          />
        </Panel>
      </div>
    </>
  );
}
