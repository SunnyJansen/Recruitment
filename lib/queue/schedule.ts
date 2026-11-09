/**
 * Werktijden voor automatische LinkedIn-acties (harde regel 2):
 * alleen op werkdagen, tussen begin- en eindtijd, in Nederlandse tijd,
 * en (instelbaar) niet op Nederlandse feestdagen. Puur en los te testen.
 */

export type WorkSchedule = {
  workDays: number[]; // 1 = maandag … 7 = zondag
  start: string; // "08:00"
  end: string; // "18:00"
  timezone: string; // "Europe/Amsterdam"
  skipDutchHolidays: boolean;
};

export const DEFAULT_SCHEDULE: WorkSchedule = {
  workDays: [1, 2, 3, 4, 5],
  start: "08:00",
  end: "18:00",
  timezone: "Europe/Amsterdam",
  skipDutchHolidays: true,
};

/** Datum en tijd zoals een klok in de gegeven tijdzone ze toont. */
function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
    weekday,
  };
}

/** Paaszondag (Gregoriaanse kalender, algoritme van Meeus/Jones/Butcher). */
function easter(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

const key = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

function plusDays(y: number, m: number, d: number, n: number) {
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return key(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Nederlandse feestdagen van een jaar, als "JJJJ-MM-DD" → naam. */
export function dutchHolidays(year: number): Map<string, string> {
  const e = easter(year);
  const kingsDay = new Date(Date.UTC(year, 3, 27)).getUTCDay() === 0 ? 26 : 27; // valt het op zondag, dan zaterdag ervoor
  return new Map([
    [key(year, 1, 1), "Nieuwjaarsdag"],
    [plusDays(year, e.month, e.day, -2), "Goede Vrijdag"],
    [key(year, e.month, e.day), "Eerste Paasdag"],
    [plusDays(year, e.month, e.day, 1), "Tweede Paasdag"],
    [key(year, 4, kingsDay), "Koningsdag"],
    [key(year, 5, 5), "Bevrijdingsdag"],
    [plusDays(year, e.month, e.day, 39), "Hemelvaartsdag"],
    [plusDays(year, e.month, e.day, 49), "Eerste Pinksterdag"],
    [plusDays(year, e.month, e.day, 50), "Tweede Pinksterdag"],
    [key(year, 12, 25), "Eerste Kerstdag"],
    [key(year, 12, 26), "Tweede Kerstdag"],
  ]);
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

export type WorkCheck = { open: true } | { open: false; reason: string };

/** Mag er op dit moment een automatische LinkedIn-actie gebeuren? */
export function checkWorkingHours(now: Date, schedule: WorkSchedule = DEFAULT_SCHEDULE): WorkCheck {
  const t = localParts(now, schedule.timezone);
  if (schedule.skipDutchHolidays) {
    const holiday = dutchHolidays(t.year).get(key(t.year, t.month, t.day));
    if (holiday) return { open: false, reason: `Het is ${holiday}: geen LinkedIn-acties op feestdagen.` };
  }
  if (!schedule.workDays.includes(t.weekday)) {
    return { open: false, reason: "Buiten werkdagen: LinkedIn-acties gebeuren alleen op werkdagen." };
  }
  if (t.minutes < toMinutes(schedule.start) || t.minutes >= toMinutes(schedule.end)) {
    return { open: false, reason: `Buiten werktijd: LinkedIn-acties alleen tussen ${schedule.start} en ${schedule.end}.` };
  }
  return { open: true };
}
