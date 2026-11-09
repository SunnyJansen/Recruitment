"use client";

import { CheckCircle2, MapPin, Pause, Play, Save, StepForward } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Textarea } from "@/components/ui/textarea";
import type { CampaignQuery, CampaignStatus } from "@/lib/db/types";
import { checkInviteNote, checkTemplate, PLACEHOLDERS, renderTemplate } from "@/lib/domain/templates";
import type { TickReport } from "@/lib/queue/outreach";
import { cn } from "@/lib/utils";

import { findLocations, type LocationOption } from "../zoeken/actions";

import { approveCampaign, runTickNow, saveCampaign, setCampaignActive } from "./actions";

const STATUS = {
  draft: { label: "Concept", tone: "gray" as const },
  active: { label: "Actief", tone: "green" as const },
  paused: { label: "Gepauzeerd", tone: "gray" as const },
};

function Chip({ checked, onChange, children }: { checked: boolean; onChange: () => void; children: React.ReactNode }) {
  return (
    <label className="cursor-pointer">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={onChange} />
      <span
        className={cn(
          "inline-flex h-7 items-center rounded-full border border-surface-border bg-surface-raised px-3 text-[13px] font-medium text-muted-foreground select-none",
          "peer-checked:border-transparent peer-checked:bg-chip-active peer-checked:text-chip-active-text peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring",
        )}
      >
        {children}
      </span>
    </label>
  );
}

export function CampaignClient({
  vacancyId,
  vacancy,
  sender,
  limits,
  initial,
}: {
  vacancyId: string;
  vacancy: { title: string; location: string | null };
  sender: { name: string; title: string; company: string };
  limits: { inviteNoteMaxChars: number; maxInviteNotesPerWeek: number };
  initial: {
    status: CampaignStatus | null;
    approvedLabel: string | null;
    approvedAt: string | null;
    query: CampaignQuery;
    templateNl: string;
    templateEn: string;
    inviteNoteNl: string;
    inviteNoteEn: string;
  };
}) {
  const router = useRouter();
  const [keywords, setKeywords] = useState(initial.query.keywords ?? "");
  const [title, setTitle] = useState(initial.query.title ?? "");
  const [locationText, setLocationText] = useState(vacancy.location ?? "");
  const [locations, setLocations] = useState<LocationOption[]>(
    (initial.query.location_ids ?? []).map((id, i) => ({ id, title: initial.query.location_labels?.[i] ?? id })),
  );
  const [selectedLocations, setSelectedLocations] = useState<string[]>(initial.query.location_ids ?? []);
  const [distances, setDistances] = useState<(1 | 2 | 3)[]>(initial.query.network_distance ?? []);
  const [templateNl, setTemplateNl] = useState(initial.templateNl);
  const [templateEn, setTemplateEn] = useState(initial.templateEn);
  const [noteNl, setNoteNl] = useState(initial.inviteNoteNl);
  const [noteEn, setNoteEn] = useState(initial.inviteNoteEn);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [tick, setTick] = useState<TickReport | null>(null);
  const [pending, startTransition] = useTransition();
  const [locPending, startLoc] = useTransition();

  const changed =
    templateNl.trim() !== initial.templateNl.trim() ||
    templateEn.trim() !== initial.templateEn.trim() ||
    noteNl.replace(/\s+/g, " ").trim() !== initial.inviteNoteNl ||
    noteEn.replace(/\s+/g, " ").trim() !== initial.inviteNoteEn ||
    keywords.trim() !== (initial.query.keywords ?? "") ||
    title.trim() !== (initial.query.title ?? "") ||
    JSON.stringify(selectedLocations) !== JSON.stringify(initial.query.location_ids ?? []) ||
    JSON.stringify(distances) !== JSON.stringify(initial.query.network_distance ?? []);

  const input = () => ({
    query: {
      keywords,
      title,
      location_ids: selectedLocations,
      location_labels: selectedLocations.map((id) => locations.find((l) => l.id === id)?.title ?? id),
      network_distance: distances,
    },
    templateNl,
    templateEn,
    inviteNoteNl: noteNl,
    inviteNoteEn: noteEn,
  });

  const run = (fn: () => Promise<{ ok: boolean; message?: string; problems?: string[] }>) =>
    startTransition(async () => {
      setMessage(null);
      setProblems([]);
      const r = await fn();
      setMessage(r.message ? { text: r.message, tone: r.ok ? "ok" : "error" } : null);
      setProblems(r.problems ?? []);
      router.refresh();
    });

  const sampleNl = renderTemplate(templateNl, {
    fullName: "Jan de Vries",
    vacancyTitle: vacancy.title,
    vacancyLocation: vacancy.location,
    language: "nl",
    senderName: sender.name,
    senderTitle: sender.title,
    companyName: sender.company,
  });
  const sampleEn = renderTemplate(templateEn, {
    fullName: "Thabo Nkosi",
    vacancyTitle: vacancy.title,
    vacancyLocation: vacancy.location,
    language: "en",
    senderName: sender.name,
    senderTitle: sender.title,
    companyName: sender.company,
  });
  const baseVars = {
    vacancyTitle: vacancy.title,
    vacancyLocation: vacancy.location,
    senderName: sender.name,
    senderTitle: sender.title,
    companyName: sender.company,
  };
  const noteSampleNl = renderTemplate(noteNl, { ...baseVars, fullName: "Jan de Vries", language: "nl" });
  const noteSampleEn = renderTemplate(noteEn, { ...baseVars, fullName: "Thabo Nkosi", language: "en" });
  const liveProblems = [
    ...checkInviteNote(noteNl, "nl", limits.inviteNoteMaxChars, { ...baseVars, fullName: "", language: "nl" }),
    ...checkInviteNote(noteEn, "en", limits.inviteNoteMaxChars, { ...baseVars, fullName: "", language: "en" }),
    ...checkTemplate(templateNl, "nl"),
    ...checkTemplate(templateEn, "en"),
  ];
  const status = initial.status ?? "draft";

  return (
    <>
      <Panel
        title="Status"
        actions={
          <>
            <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>
            {status === "active" && (
              <Button variant="bordered" disabled={pending} onClick={() => run(() => setCampaignActive(vacancyId, false))}>
                <Pause />
                Pauzeer
              </Button>
            )}
            {status === "paused" && initial.approvedAt && !changed && (
              <Button variant="bordered" disabled={pending} onClick={() => run(() => setCampaignActive(vacancyId, true))}>
                <Play />
                Hervat
              </Button>
            )}
          </>
        }
      >
        <p className="text-[13px] text-muted-foreground">
          {initial.approvedAt
            ? `Goedgekeurd door ${initial.approvedLabel} op ${new Date(initial.approvedAt).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" })}.`
            : "Nog niet goedgekeurd. Het systeem benadert pas iemand nadat je de tekst en de zoekopdracht hebt goedgekeurd."}
          {changed && initial.approvedAt ? " Je hebt iets gewijzigd: na opslaan moet je opnieuw goedkeuren." : ""}
        </p>
        {status === "active" && (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="bordered"
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setTick(await runTickNow());
                  router.refresh();
                })
              }
            >
              <StepForward />
              Nu één stap uitvoeren (test)
            </Button>
            {tick && (
              <span role="status" className={cn("text-[13px]", tick.state === "error" ? "text-danger-text" : "text-muted-foreground")}>
                {[...tick.steps, tick.message].filter(Boolean).join(" · ") || "Geen actie nodig."}
              </span>
            )}
          </div>
        )}
      </Panel>

      <Panel title="1. Zoekopdracht" subtitle="Het systeem zoekt hiermee elke werkdag zelf nieuwe kandidaten.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Trefwoorden" htmlFor="c-keywords" hint="Bijv. TIG lasser RVS">
            <Input id="c-keywords" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
          </Field>
          <Field label="Functietitel" htmlFor="c-title" hint="Zoekt in de huidige functie, bijv. lasser">
            <Input id="c-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
        </div>
        <Field label="Locatie" htmlFor="c-location" hint="Zoek de locatie op en vink aan.">
          <div className="flex flex-wrap gap-2">
            <div className="min-w-[220px] flex-1">
              <Input id="c-location" value={locationText} onChange={(e) => setLocationText(e.target.value)} placeholder="Bijv. Limburg of Gauteng" />
            </div>
            <Button
              type="button"
              variant="bordered"
              disabled={locPending}
              onClick={() =>
                startLoc(async () => {
                  const r = await findLocations(locationText);
                  if (r.ok) setLocations((prev) => [...prev.filter((p) => selectedLocations.includes(p.id)), ...r.items.filter((i) => !prev.some((p) => p.id === i.id))]);
                  else setMessage({ text: r.message, tone: "error" });
                })
              }
            >
              <MapPin />
              {locPending ? "Zoeken…" : "Zoek locatie"}
            </Button>
          </div>
        </Field>
        {locations.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Locaties campagne">
            {locations.map((l) => (
              <Chip key={l.id} checked={selectedLocations.includes(l.id)} onChange={() => setSelectedLocations((s) => (s.includes(l.id) ? s.filter((x) => x !== l.id) : [...s, l.id]))}>
                {l.title}
              </Chip>
            ))}
          </div>
        )}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-field-label text-muted-foreground">Netwerk (optioneel)</legend>
          <div className="flex flex-wrap gap-2">
            {([1, 2, 3] as const).map((d) => (
              <Chip key={d} checked={distances.includes(d)} onChange={() => setDistances((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...s, d]))}>
                {d === 3 ? "3e+" : `${d}e`} graads
              </Chip>
            ))}
          </div>
        </fieldset>
      </Panel>

      <Panel
        title="2. Uitnodigingstekst (kort)"
        subtitle={`Gaat mee met het connectieverzoek. Dit is het eerste wat de kandidaat leest, dus met bron en afmeldzin. Max. ${limits.inviteNoteMaxChars} tekens. Gratis LinkedIn: ±${limits.maxInviteNotesPerWeek} per week mét tekst; daarboven zonder tekst. Leeg laten = altijd zonder tekst.`}
      >
        <div className="grid gap-5 lg:grid-cols-2">
          {(
            [
              ["c-note-nl", "Nederlands", noteNl, setNoteNl, noteSampleNl, "Jan de Vries"],
              ["c-note-en", "Engels", noteEn, setNoteEn, noteSampleEn, "Thabo Nkosi"],
            ] as const
          ).map(([id, label, value, set, sample, who]) => (
            <div key={id} className="flex flex-col gap-3">
              <Field label={label} htmlFor={id}>
                <Textarea id={id} rows={4} value={value} onChange={(e) => set(e.target.value)} />
              </Field>
              {value.trim() && (
                <div className="rounded-tile bg-surface-raised p-4">
                  <div className="mb-2 flex justify-between gap-2">
                    <span className="text-field-label text-muted-foreground">Voorbeeld ({who})</span>
                    <span className={cn("text-app-meta tabular-nums", sample.length > limits.inviteNoteMaxChars ? "text-danger-text" : "text-muted-foreground")}>
                      {sample.length} / {limits.inviteNoteMaxChars} tekens
                    </span>
                  </div>
                  <p className="text-[13px]">{sample}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="3. Bericht na acceptatie"
        subtitle="Gaat automatisch naar kandidaten die je uitnodiging accepteren. Nederlands voor kandidaten in Nederland, Engels voor de rest."
      >
        <p className="text-app-meta text-muted-foreground">
          Invulvelden: {PLACEHOLDERS.map((p) => (
            <code key={p.key} title={p.label} className="mr-1.5 rounded bg-surface-raised px-1.5">
              {p.key}
            </code>
          ))}
        </p>
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
            <Field label="Nederlands" htmlFor="c-nl">
              <Textarea id="c-nl" rows={11} value={templateNl} onChange={(e) => setTemplateNl(e.target.value)} />
            </Field>
            <div className="rounded-tile bg-surface-raised p-4">
              <p className="mb-2 text-field-label text-muted-foreground">Voorbeeld (Jan de Vries)</p>
              <p className="text-[13px] whitespace-pre-line">{sampleNl}</p>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <Field label="Engels" htmlFor="c-en">
              <Textarea id="c-en" rows={11} value={templateEn} onChange={(e) => setTemplateEn(e.target.value)} />
            </Field>
            <div className="rounded-tile bg-surface-raised p-4">
              <p className="mb-2 text-field-label text-muted-foreground">Voorbeeld (Thabo Nkosi)</p>
              <p className="text-[13px] whitespace-pre-line">{sampleEn}</p>
            </div>
          </div>
        </div>
        {liveProblems.length > 0 && (
          <ul className="list-disc pl-5 text-[13px] text-danger-text">
            {liveProblems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="4. Goedkeuren" subtitle="Met goedkeuren geef je toestemming dat precies deze teksten automatisch verstuurd worden.">
        {message && (
          <p role={message.tone === "error" ? "alert" : "status"} className={cn("text-[13px]", message.tone === "error" ? "text-danger-text" : "text-success")}>
            {message.text}
          </p>
        )}
        {problems.length > 0 && (
          <ul className="list-disc pl-5 text-[13px] text-danger-text">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="bordered" disabled={pending} onClick={() => run(() => saveCampaign(vacancyId, input()))}>
            <Save />
            Bewaar als concept
          </Button>
          <Button variant="default" disabled={pending || liveProblems.length > 0} onClick={() => run(() => approveCampaign(vacancyId, input()))}>
            <CheckCircle2 />
            {status === "active" && !changed ? "Opnieuw goedkeuren" : "Keur goed en start"}
          </Button>
        </div>
      </Panel>
    </>
  );
}
