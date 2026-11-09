"use client";

import { Pause, Play, RotateCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { ImportStatus } from "@/lib/db/types";
import type { ImportProgress } from "@/lib/queue/import";

import { processImport } from "../zoeken/actions";

const STATUS: Record<ImportStatus, { label: string; tone: "blue" | "green" | "red" | "gray" }> = {
  pending: { label: "Wacht", tone: "gray" },
  processing: { label: "Bezig", tone: "blue" },
  done: { label: "Toegevoegd", tone: "green" },
  skipped: { label: "Overgeslagen", tone: "gray" },
  failed: { label: "Mislukt", tone: "red" },
};

/**
 * Verwerkt de importwachtrij zolang deze pagina open staat: telkens één
 * profiel, daarna wachten op de willekeurige pauze die de database bepaalt.
 */
export function ImportRunner({ vacancyId, initial }: { vacancyId: string; initial: ImportProgress }) {
  const [progress, setProgress] = useState<ImportProgress>(initial);
  const [running, setRunning] = useState(initial.counts.pending > 0);
  const [nextAt, setNextAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  const step = useCallback(async () => {
    setBusy(true);
    setNextAt(null);
    let p: ImportProgress;
    try {
      p = await processImport(vacancyId);
    } catch {
      p = { ...progress, state: "waiting", message: "Verbinding even weg; opnieuw proberen…", waitSeconds: 15 };
    }
    setBusy(false);
    setProgress(p);
    if (p.state === "finished" || p.state === "error" || p.state === "paused") {
      setRunning(false);
      return;
    }
    // Iets na de pauze opnieuw proberen; de database bewaakt het echte tempo.
    const wait = Math.max(2, (p.waitSeconds ?? 5) + 1);
    setNow(Date.now());
    setNextAt(Date.now() + wait * 1000);
  }, [vacancyId, progress]);

  // Volgende stap plannen.
  useEffect(() => {
    if (!running || busy) return;
    const delay = nextAt ? Math.max(0, nextAt - Date.now()) : 0;
    const t = setTimeout(() => {
      void step();
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- alleen opnieuw plannen bij nieuwe stap
  }, [running, nextAt, busy]);

  // Aftellen voor de weergave.
  useEffect(() => {
    if (!nextAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [nextAt]);

  const c = progress.counts;
  const total = c.pending + c.processing + c.done + c.skipped + c.failed;
  const handled = c.done + c.skipped + c.failed;
  const pct = total ? Math.round((handled / total) * 100) : 0;
  const secondsLeft = nextAt ? Math.max(0, Math.ceil((nextAt - now) / 1000)) : null;

  const status =
    progress.state === "finished"
      ? "Klaar."
      : !running
        ? progress.state === "paused" || progress.state === "error"
          ? progress.message
          : "Gepauzeerd."
        : busy
          ? "Profiel ophalen…"
          : secondsLeft != null
            ? `Volgende profiel over ${secondsLeft} s (willekeurige pauze, zoals een mens).`
            : "Bezig…";

  return (
    <>
      <Panel
        title="Importeren"
        subtitle="Profielen worden één voor één opgehaald, met een willekeurige pauze van 30–120 seconden. Laat deze pagina open staan."
        actions={
          progress.state === "finished" ? (
            <Button asChild variant="default">
              <Link href={`/vacatures/${vacancyId}`}>Naar de vacature</Link>
            </Button>
          ) : running ? (
            <Button variant="bordered" onClick={() => setRunning(false)}>
              <Pause />
              Pauzeer
            </Button>
          ) : (
            <Button variant="default" onClick={() => setRunning(true)} disabled={c.pending === 0}>
              {progress.state === "error" ? <RotateCw /> : <Play />}
              {progress.state === "error" || progress.state === "paused" ? "Opnieuw proberen" : "Hervat"}
            </Button>
          )
        }
      >
        <div className="flex flex-col gap-2">
          <div
            className="h-2 overflow-hidden rounded-full bg-surface-raised"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={handled}
            aria-label="Voortgang import"
          >
            <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex flex-wrap justify-between gap-2 text-[13px]">
            <span>
              {handled} van {total} verwerkt · {c.done} toegevoegd · {c.skipped} overgeslagen
              {c.failed ? ` · ${c.failed} mislukt` : ""}
            </span>
            <span aria-live="polite" className={progress.state === "error" ? "text-danger-text" : "text-muted-foreground"}>
              {status}
            </span>
          </div>
          {running && progress.message && progress.state !== "finished" && (
            <p className="text-app-meta text-muted-foreground">{progress.message}</p>
          )}
        </div>
      </Panel>

      <Panel title="Wachtrij">
        {progress.items.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">De wachtrij voor deze vacature is leeg.</p>
        ) : (
          <Table className="min-w-[520px]">
            <THead>
              <TR>
                <TH>Naam</TH>
                <TH>Status</TH>
                <TH>Resultaat</TH>
              </TR>
            </THead>
            <TBody>
              {progress.items.map((i) => (
                <TR key={i.id}>
                  <TD>
                    {i.candidate_id ? (
                      <Link href={`/kandidaten/${i.candidate_id}`} className="font-semibold hover:text-accent-text hover:underline">
                        {i.name ?? "Onbekend"}
                      </Link>
                    ) : (
                      (i.name ?? "Onbekend")
                    )}
                  </TD>
                  <TD>
                    <Badge tone={STATUS[i.status].tone}>{STATUS[i.status].label}</Badge>
                  </TD>
                  <TD muted>{i.result ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>
    </>
  );
}
