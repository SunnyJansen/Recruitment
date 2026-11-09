import { ExternalLink } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { OutreachStatus } from "@/lib/db/types";
import { ENGINE_STATE, OUTREACH_STATUS } from "@/lib/domain/labels";
import { formatDateTime } from "@/lib/format";

export type EngineStatus = { at: string; state: string; steps?: string[]; message?: string } | null;

/** Wat deed de automatische motor als laatste, en draait cron-job.org nog? */
export function EngineStatusPanel({ status, minutesAgo }: { status: EngineStatus; minutesAgo: number | null }) {
  const state = status ? (ENGINE_STATE[status.state] ?? { label: status.state, tone: "gray" as const }) : null;
  const stale = minutesAgo !== null && minutesAgo > 15;
  const text = status ? [...(status.steps ?? []), status.message].filter(Boolean).join(" · ") : "";
  return (
    <Panel
      title="Motorstatus"
      subtitle="De laatste automatische stap (cron-job.org roept de app elke 5 minuten aan)."
      actions={state && <Badge tone={state.tone}>{state.label}</Badge>}
    >
      {!status ? (
        <p className="text-[13px] text-danger-text">
          Nog nooit uitgevoerd. Staat cron-job.org aan met het adres …/api/cron/outreach en de header Authorization? Je kunt ook
          hieronder op &quot;Nu één stap uitvoeren&quot; klikken.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-app-body">{text || "Geen actie nodig."}</p>
          <p className={stale ? "text-[13px] text-danger-text" : "text-app-meta text-muted-foreground"}>
            Laatste keer: {formatDateTime(status.at)}
            {stale && ` — dat is ${minutesAgo} minuten geleden. Controleer of cron-job.org nog draait (History moet 200 tonen).`}
          </p>
        </div>
      )}
    </Panel>
  );
}

export type OutreachRow = {
  candidateId: string;
  name: string;
  headline: string | null;
  location: string | null;
  linkedinUrl: string | null;
  status: OutreachStatus;
  error: string | null;
  invitedAt: string | null;
  lastAt: string | null;
  withNote: boolean | null;
};

/** Iedereen die deze campagne (automatisch) benadert of klaar heeft staan. */
export function OutreachTable({ rows, total }: { rows: OutreachRow[]; total: number }) {
  return (
    <Panel
      title="Benaderde kandidaten"
      subtitle={rows.length < total ? `${rows.length} van ${total} getoond, meest recente eerst.` : `${total} in deze campagne, meest recente eerst.`}
    >
      {rows.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Nog niemand. Na goedkeuren zoekt het systeem bij de volgende stap kandidaten.</p>
      ) : (
        <Table className="min-w-[760px]">
          <THead>
            <TR>
              <TH>Naam</TH>
              <TH>Status</TH>
              <TH>Uitnodiging</TH>
              <TH align="end">Laatste actie</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.candidateId}>
                <TD>
                  <div className="flex items-center gap-1.5">
                    <Link href={`/kandidaten/${r.candidateId}`} className="font-semibold hover:text-accent-text hover:underline">
                      {r.name}
                    </Link>
                    {r.linkedinUrl && (
                      <a href={r.linkedinUrl} target="_blank" rel="noreferrer" aria-label={`LinkedIn-profiel van ${r.name}`} className="text-muted-foreground hover:text-accent-text">
                        <ExternalLink className="size-3.5" />
                      </a>
                    )}
                  </div>
                  {(r.headline || r.location) && (
                    <div className="text-app-meta text-muted-foreground">{[r.headline, r.location].filter(Boolean).join(" · ")}</div>
                  )}
                </TD>
                <TD>
                  <Badge tone={OUTREACH_STATUS[r.status].tone}>{OUTREACH_STATUS[r.status].label}</Badge>
                  {r.error && <div className="mt-1 max-w-[260px] text-app-meta text-danger-text">{r.error}</div>}
                </TD>
                <TD muted>
                  {r.invitedAt ? (
                    <>
                      {formatDateTime(r.invitedAt)}
                      <div className="text-app-meta">{r.withNote ? "met tekst" : "zonder tekst"}</div>
                    </>
                  ) : (
                    "—"
                  )}
                </TD>
                <TD align="end" muted>
                  {r.lastAt ? formatDateTime(r.lastAt) : "—"}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Panel>
  );
}
