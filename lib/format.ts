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
