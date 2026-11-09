import { ExternalLink, Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LinkPicker } from "@/components/recruitment/link-picker";
import { OptOutButton } from "@/components/recruitment/opt-out-button";
import { StageSelect } from "@/components/recruitment/stage-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { createClient } from "@/lib/db/server";
import { isUuid } from "@/lib/domain/form-state";
import { experienceToText } from "@/lib/domain/forms";
import { CANDIDATE_STATUS, countryLabel, LANGUAGES } from "@/lib/domain/labels";
import { buildTimeline } from "@/lib/domain/timeline";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Kandidaat — Cr8las Recruitment" };

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-field-label text-muted-foreground">{label}</dt>
      <dd className="text-app-body break-words">{children || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

const DOT: Record<string, string> = {
  blue: "bg-accent-text",
  green: "bg-success",
  red: "bg-danger-text",
  gray: "bg-muted-foreground",
};

export default async function KandidaatPage({ params }: PageProps<"/kandidaten/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const { data: c } = await supabase.from("candidates").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();

  const [{ data: links }, { data: vacancies }, { data: logs }, { data: messages }] = await Promise.all([
    supabase.from("candidate_vacancy").select("vacancy_id, stage, created_at, match_score").eq("candidate_id", id),
    supabase.from("vacancies").select("id, title, location, status").order("created_at", { ascending: false }),
    supabase
      .from("activity_log")
      .select("id, action, details, created_at, actor")
      .eq("entity", "candidate")
      .eq("entity_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("messages")
      .select("id, channel, direction, status, body, created_at, sent_at")
      .eq("candidate_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const vacancyById = new Map((vacancies ?? []).map((v) => [v.id, v]));
  const linkedIds = new Set((links ?? []).map((l) => l.vacancy_id));
  const linkable = (vacancies ?? [])
    .filter((v) => !linkedIds.has(v.id) && v.status !== "closed")
    .map((v) => ({ id: v.id, label: v.location ? `${v.title} (${v.location})` : v.title }));
  const timeline = buildTimeline(logs ?? [], messages ?? []);
  const status = CANDIDATE_STATUS[c.status];
  const active = c.status === "active";
  const experience = experienceToText(c.experience);

  return (
    <>
      <Panel
        title={c.full_name}
        subtitle={[c.headline, c.current_company].filter(Boolean).join(" · ") || undefined}
        actions={
          <>
            <Badge tone={status.tone}>{status.label}</Badge>
            {c.status !== "anonymized" && (
              <Button asChild variant="bordered">
                <Link href={`/kandidaten/${id}/bewerken`}>
                  <Pencil />
                  Bewerken
                </Link>
              </Button>
            )}
          </>
        }
      >
        {c.status === "opted_out" && (
          <p role="status" className="rounded-tile bg-danger-tint px-4 py-3 text-[13px] text-danger-text">
            Afgemeld op {formatDate(c.opted_out_at)}. Deze kandidaat wordt nooit meer benaderd.
          </p>
        )}
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Woonplaats">{[c.location, c.country ? countryLabel(c.country) : null].filter(Boolean).join(", ")}</Info>
          <Info label="Taal berichten">{LANGUAGES[c.language]}</Info>
          <Info label="E-mailadres">{c.email && <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a>}</Info>
          <Info label="Telefoon">{c.phone}</Info>
          <Info label="LinkedIn">
            {c.linkedin_url && (
              <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent-text hover:underline">
                Profiel openen <ExternalLink className="size-3.5" aria-hidden />
              </a>
            )}
          </Info>
          <Info label="Bron">{c.source === "manual" ? "Handmatig toegevoegd" : "LinkedIn"}</Info>
          <Info label="Toegevoegd">{formatDate(c.created_at)}</Info>
          <Info label="Laatste contact">{c.last_contacted_at ? formatDate(c.last_contacted_at) : ""}</Info>
          <Info label="Vaardigheden">{c.skills.join(", ")}</Info>
          <div className="sm:col-span-2 lg:col-span-3">
            <Info label="Werkervaring">{experience && <span className="whitespace-pre-line">{experience}</span>}</Info>
          </div>
        </dl>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel title="Vacatures" subtitle={`${links?.length ?? 0} gekoppeld`}>
          {links?.length ? (
            <Table className="min-w-[420px]">
              <THead>
                <TR>
                  <TH>Vacature</TH>
                  <TH>Fase</TH>
                  <TH align="end">Gekoppeld</TH>
                </TR>
              </THead>
              <TBody>
                {links.map((l) => {
                  const v = vacancyById.get(l.vacancy_id);
                  return (
                    <TR key={l.vacancy_id}>
                      <TD>
                        <Link href={`/vacatures/${l.vacancy_id}`} className="font-semibold hover:text-accent-text hover:underline">
                          {v?.title ?? "Onbekende vacature"}
                        </Link>
                        {v?.location && <div className="text-app-meta text-muted-foreground">{v.location}</div>}
                      </TD>
                      <TD>
                        <StageSelect candidateId={id} vacancyId={l.vacancy_id} stage={l.stage} label={`Fase bij ${v?.title ?? "vacature"}`} />
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
            <p className="text-[13px] text-muted-foreground">Nog niet aan een vacature gekoppeld.</p>
          )}
          {active && (
            <LinkPicker
              fixed="candidate"
              fixedId={id}
              options={linkable}
              label="Koppel aan vacature"
              emptyText="Geen andere open vacatures om aan te koppelen."
            />
          )}
        </Panel>

        <Panel title="Tijdlijn">
          {timeline.length ? (
            <ol className="flex flex-col">
              {timeline.map((item, i) => (
                <li key={item.id} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < timeline.length - 1 && <span aria-hidden className="absolute top-3 bottom-0 left-[4px] w-px bg-surface-border" />}
                  <span aria-hidden className={cn("relative mt-1.5 size-[9px] shrink-0 rounded-full", DOT[item.tone])} />
                  <div className="min-w-0">
                    <p className="text-app-body">{item.title}</p>
                    {item.detail && <p className="text-[13px] break-words text-muted-foreground">{item.detail}</p>}
                    <p className="text-app-meta text-muted-foreground">{formatDateTime(item.at)}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[13px] text-muted-foreground">Nog geen activiteit.</p>
          )}
        </Panel>
      </div>

      {active && (
        <Panel title="Privacy" subtitle="Vraagt de kandidaat om niet meer benaderd te worden? Meld de kandidaat dan af.">
          <div className="flex">
            <OptOutButton candidateId={id} name={c.full_name} />
          </div>
        </Panel>
      )}
    </>
  );
}
