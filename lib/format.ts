/** Datums altijd in Nederlandse notatie en Nederlandse tijd. */
const dateFmt = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Amsterdam" });
const dateTimeFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Amsterdam",
});

export function formatDate(value: string | Date | null | undefined) {
  return value ? dateFmt.format(new Date(value)) : "—";
}

export function formatDateTime(value: string | Date | null | undefined) {
  return value ? dateTimeFmt.format(new Date(value)) : "—";
}

/** Tijdstip van n dagen geleden (ISO), bijv. voor "afgelopen 7 dagen". */
export function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/** Aantal minuten sinds een tijdstip (afgerond), of null. */
export function minutesSince(value: string | null | undefined) {
  if (!value) return null;
  return Math.round((Date.now() - new Date(value).getTime()) / 60_000);
}
