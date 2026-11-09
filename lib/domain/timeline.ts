/**
 * Zet logregels en berichten om naar leesbare regels voor de tijdlijn op de
 * kandidaatpagina. Puur, zodat het los te testen is.
 */
import type { Json } from "@/lib/db/types";

import { STAGES } from "./labels.ts";

export type TimelineItem = {
  id: string;
  at: string;
  title: string;
  detail?: string;
  tone: "blue" | "green" | "red" | "gray";
};

type LogRow = { id: number | string; action: string; details: Json; created_at: string; actor: string };
type MessageRow = {
  id: string;
  channel: string;
  direction: string;
  status: string;
  body: string;
  created_at: string;
  sent_at: string | null;
};

const CHANNEL: Record<string, string> = {
  linkedin_invite: "LinkedIn-uitnodiging",
  linkedin_message: "LinkedIn-bericht",
  email: "E-mail",
};

const MESSAGE_STATUS: Record<string, string> = {
  draft: "concept",
  approved: "goedgekeurd",
  rejected: "afgewezen",
  queued: "in wachtrij",
  sent: "verstuurd",
  failed: "mislukt",
  received: "ontvangen",
};

function stageLabel(value: unknown) {
  return typeof value === "string" && value in STAGES ? STAGES[value as keyof typeof STAGES].label : String(value ?? "?");
}

export function logToTimeline(row: LogRow): TimelineItem {
  const d = (row.details && typeof row.details === "object" && !Array.isArray(row.details) ? row.details : {}) as Record<
    string,
    Json | undefined
  >;
  const vacancy = typeof d.vacancy_title === "string" ? d.vacancy_title : "een vacature";
  const base = { id: `log-${row.id}`, at: row.created_at };
  switch (row.action) {
    case "candidate_created":
      return {
        ...base,
        title: "Kandidaat toegevoegd",
        detail: d.matched_do_not_contact ? "Stond op de niet-benaderen-lijst: direct afgemeld." : d.source === "manual" ? "Handmatig ingevoerd" : undefined,
        tone: d.matched_do_not_contact ? "red" : "gray",
      };
    case "candidate_updated":
      return { ...base, title: "Gegevens bijgewerkt", tone: "gray" };
    case "linked_to_vacancy":
      return { ...base, title: `Gekoppeld aan ${vacancy}`, tone: "blue" };
    case "stage_changed":
      return {
        ...base,
        title: `Fase gewijzigd bij ${vacancy}`,
        detail: `${stageLabel(d.from)} → ${stageLabel(d.to)}`,
        tone: d.to === "rejected" ? "red" : d.to === "new" ? "gray" : "green",
      };
    case "opted_out":
      return { ...base, title: "Afgemeld: nooit meer benaderen", detail: typeof d.reason === "string" ? d.reason : undefined, tone: "red" };
    default:
      return { ...base, title: row.action.replaceAll("_", " "), tone: "gray" };
  }
}

export function messageToTimeline(m: MessageRow): TimelineItem {
  const channel = CHANNEL[m.channel] ?? m.channel;
  const incoming = m.direction === "in";
  return {
    id: `msg-${m.id}`,
    at: (incoming ? m.created_at : m.sent_at) ?? m.created_at,
    title: incoming ? `${channel} ontvangen` : `${channel} (${MESSAGE_STATUS[m.status] ?? m.status})`,
    detail: m.body.length > 160 ? `${m.body.slice(0, 160)}…` : m.body,
    tone: incoming ? "green" : m.status === "failed" || m.status === "rejected" ? "red" : "blue",
  };
}

/** Nieuwste bovenaan. */
export function buildTimeline(logs: LogRow[], messages: MessageRow[]): TimelineItem[] {
  return [...logs.map(logToTimeline), ...messages.map(messageToTimeline)].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );
}
