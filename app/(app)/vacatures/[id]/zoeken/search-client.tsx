"use client";

import { Download, ExternalLink, MapPin, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import {
  type AnnotatedPerson,
  enqueueImports,
  findLocations,
  type LocationOption,
  runSearch,
} from "./actions";

const STATUS_BADGE = {
  exists: { label: "Al in database", tone: "blue" as const },
  opted_out: { label: "Afgemeld", tone: "red" as const },
  queued: { label: "In wachtrij", tone: "gray" as const },
};

const DISTANCE_LABEL = { 1: "1e", 2: "2e", 3: "3e+" } as const;

function Chip({ checked, onChange, children }: { checked: boolean; onChange: () => void; children: React.ReactNode }) {
  return (
    <label className="cursor-pointer">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={onChange} />
      <span
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-full border border-surface-border bg-surface-raised px-3 text-[13px] font-medium text-muted-foreground select-none",
          "peer-checked:border-transparent peer-checked:bg-chip-active peer-checked:text-chip-active-text peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring",
        )}
      >
        {children}
      </span>
    </label>
  );
}

export function SearchClient({
  vacancyId,
  initial,
  usage,
}: {
  vacancyId: string;
  initial: { keywords: string; title: string; location: string };
  usage: { searchUsed: number; searchLimit: number; viewsUsed: number; viewsLimit: number };
}) {
  const router = useRouter();
  const [keywords, setKeywords] = useState(initial.keywords);
  const [title, setTitle] = useState(initial.title);
  const [locationText, setLocationText] = useState(initial.location);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [distances, setDistances] = useState<(1 | 2 | 3)[]>([]);
  const [people, setPeople] = useState<AnnotatedPerson[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState<string | null>(null);
  const [searchId, setSearchId] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [searchUsed, setSearchUsed] = useState(usage.searchUsed);
  const [message, setMessage] = useState<string | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [pending, startTransition] = useTransition();
  const [locPending, startLocTransition] = useTransition();

  function lookupLocations() {
    setLocationMessage(null);
    startLocTransition(async () => {
      const r = await findLocations(locationText);
      if (!r.ok) {
        setLocationMessage(r.message);
        return;
      }
      setLocations((prev) => {
        const kept = prev.filter((l) => selectedLocations.includes(l.id));
        return [...kept, ...r.items.filter((i) => !kept.some((k) => k.id === i.id))];
      });
    });
  }

  function search(next: boolean) {
    setMessage(null);
    startTransition(async () => {
      const r = await runSearch({
        vacancyId,
        keywords,
        title,
        locationIds: selectedLocations,
        distances,
        cursor: next ? cursor : null,
        searchId: next ? searchId : null,
      });
      setSearched(true);
      if (!r.ok) {
        setMessage(r.message);
        return;
      }
      setPeople((prev) => (next ? [...prev, ...r.people.filter((p) => !prev.some((q) => q.providerId === p.providerId))] : r.people));
      if (!next) setSelected(new Set());
      setCursor(r.cursor);
      setSearchId(r.searchId || null);
      setTotal(r.total);
      setSearchUsed(r.usage.used);
    });
  }

  function importSelected() {
    const chosen = people.filter((p) => selected.has(p.providerId) && p.status === "new");
    setMessage(null);
    startTransition(async () => {
      const r = await enqueueImports(
        vacancyId,
        searchId,
        chosen.map((p) => ({ providerId: p.providerId, publicIdentifier: p.publicIdentifier, name: p.name })),
      );
      if (!r.ok) {
        setMessage(r.message ?? "In de wachtrij zetten is mislukt.");
        return;
      }
      router.push(`/vacatures/${vacancyId}/import`);
    });
  }

  const selectable = people.filter((p) => p.status === "new");
  const allSelected = selectable.length > 0 && selectable.every((p) => selected.has(p.providerId));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <>
      <Panel title="Zoekopdracht" subtitle={`Vandaag ${searchUsed} van ${usage.searchLimit} zoekresultaten en ${usage.viewsUsed} van ${usage.viewsLimit} profielbezoeken gebruikt.`}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            search(false);
          }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Trefwoorden" htmlFor="keywords" hint="Zoals in de zoekbalk van LinkedIn, bijv. TIG lasser RVS">
              <Input id="keywords" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
            </Field>
            <Field label="Functietitel" htmlFor="title" hint="Zoekt in de huidige functietitel, bijv. lasser">
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
          </div>

          <div className="flex flex-col gap-2">
            <Field label="Locatie" htmlFor="location" hint="LinkedIn zoekt op vaste locaties: zoek ze op en vink aan.">
              <div className="flex flex-wrap gap-2">
                <div className="min-w-[220px] flex-1">
                  <Input
                    id="location"
                    value={locationText}
                    onChange={(e) => setLocationText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        lookupLocations();
                      }
                    }}
                    placeholder="Bijv. Limburg, Venlo of Gauteng"
                  />
                </div>
                <Button type="button" variant="bordered" onClick={lookupLocations} disabled={locPending}>
                  <MapPin />
                  {locPending ? "Zoeken…" : "Zoek locatie"}
                </Button>
              </div>
            </Field>
            {locationMessage && <p className="text-[12px] text-danger-text">{locationMessage}</p>}
            {locations.length > 0 && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Gevonden locaties">
                {locations.map((l) => (
                  <Chip
                    key={l.id}
                    checked={selectedLocations.includes(l.id)}
                    onChange={() =>
                      setSelectedLocations((s) => (s.includes(l.id) ? s.filter((x) => x !== l.id) : [...s, l.id]))
                    }
                  >
                    {l.title}
                  </Chip>
                ))}
              </div>
            )}
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-field-label text-muted-foreground">Netwerk (optioneel)</legend>
            <div className="flex flex-wrap gap-2">
              {([1, 2, 3] as const).map((d) => (
                <Chip key={d} checked={distances.includes(d)} onChange={() => setDistances((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...s, d]))}>
                  {DISTANCE_LABEL[d]} graads
                </Chip>
              ))}
            </div>
          </fieldset>

          <p className="text-app-meta text-muted-foreground">
            Een gewoon LinkedIn-account geeft 10 resultaten per keer. Filteren op jaren ervaring kan alleen met Sales Navigator of Recruiter.
          </p>

          <div className="flex justify-end">
            <Button type="submit" variant="default" disabled={pending}>
              <Search />
              {pending && !people.length ? "Zoeken…" : "Zoek op LinkedIn"}
            </Button>
          </div>
        </form>
      </Panel>

      {message && (
        <p role="alert" className="rounded-tile bg-danger-tint px-4 py-3 text-[13px] text-danger-text">
          {message}
        </p>
      )}

      {searched && (
        <Panel
          title="Resultaten"
          subtitle={
            people.length
              ? `${people.length} getoond${total != null ? ` van ongeveer ${total.toLocaleString("nl-NL")}` : ""}. Personen die al bekend of afgemeld zijn, kun je niet selecteren.`
              : undefined
          }
          actions={
            people.length > 0 && (
              <Button variant="default" onClick={importSelected} disabled={pending || selected.size === 0}>
                <Download />
                Importeer geselecteerde ({selected.size})
              </Button>
            )
          }
        >
          {people.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Geen resultaten. Probeer andere trefwoorden of een ruimere locatie.</p>
          ) : (
            <>
              <Table className="min-w-[720px]">
                <THead>
                  <TR>
                    <TH className="w-10">
                      <input
                        type="checkbox"
                        aria-label="Alle nieuwe selecteren"
                        className="size-4 accent-[var(--accent)]"
                        checked={allSelected}
                        disabled={selectable.length === 0}
                        onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map((p) => p.providerId)))}
                      />
                    </TH>
                    <TH>Naam</TH>
                    <TH>Locatie</TH>
                    <TH>Netwerk</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {people.map((p) => (
                    <TR key={p.providerId} className={cn(p.status !== "new" && "opacity-70")}>
                      <TD>
                        <input
                          type="checkbox"
                          aria-label={`Selecteer ${p.name}`}
                          className="size-4 accent-[var(--accent)]"
                          checked={selected.has(p.providerId)}
                          disabled={p.status !== "new"}
                          onChange={() => toggle(p.providerId)}
                        />
                      </TD>
                      <TD>
                        <div className="flex items-center gap-1.5 font-semibold">
                          {p.name}
                          {p.profileUrl && (
                            <a href={p.profileUrl} target="_blank" rel="noreferrer" aria-label={`LinkedIn-profiel van ${p.name}`} className="text-muted-foreground hover:text-accent-text">
                              <ExternalLink className="size-3.5" />
                            </a>
                          )}
                        </div>
                        {p.headline && <div className="text-app-meta text-muted-foreground">{p.headline}</div>}
                      </TD>
                      <TD muted>{p.location || "—"}</TD>
                      <TD muted>{p.distance ? DISTANCE_LABEL[p.distance] : "—"}</TD>
                      <TD>
                        {p.status === "new" ? (
                          <Badge tone="green">Nieuw</Badge>
                        ) : p.candidateId ? (
                          <Link href={`/kandidaten/${p.candidateId}`}>
                            <Badge tone={STATUS_BADGE[p.status].tone}>{STATUS_BADGE[p.status].label}</Badge>
                          </Link>
                        ) : (
                          <Badge tone={STATUS_BADGE[p.status].tone}>{STATUS_BADGE[p.status].label}</Badge>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {cursor && (
                <div className="flex justify-center">
                  <Button variant="bordered" onClick={() => search(true)} disabled={pending}>
                    {pending ? "Laden…" : "Meer resultaten"}
                  </Button>
                </div>
              )}
            </>
          )}
        </Panel>
      )}
    </>
  );
}
