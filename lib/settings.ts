import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/db/types";
import { DEFAULT_SCHEDULE, type WorkSchedule } from "@/lib/queue/schedule";

/** Instellingen uit de tabel settings, met veilige standaardwaarden. */
export type AppSettings = {
  maxProfileViewsPerDay: number;
  maxSearchResultsPerDay: number;
  maxInvitesPerDay: number;
  maxInvitesPerWeek: number;
  maxMessagesPerDay: number;
  maxInviteNotesPerWeek: number;
  inviteNoteMaxChars: number;
  delayMinSeconds: number;
  delayMaxSeconds: number;
  searchPageSize: number;
  schedule: WorkSchedule;
};

const num = (v: Json | undefined, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

export async function loadSettings(supabase: SupabaseClient<Database>): Promise<AppSettings> {
  const { data } = await supabase.from("settings").select("key, value");
  const s = new Map((data ?? []).map((r) => [r.key, r.value]));
  const hours = s.get("work_hours") as { start?: string; end?: string } | undefined;
  const workDays = s.get("work_days");
  return {
    maxProfileViewsPerDay: num(s.get("max_profile_views_per_day"), 80),
    maxSearchResultsPerDay: num(s.get("max_search_results_per_day"), 1000),
    maxInvitesPerDay: num(s.get("max_invites_per_day"), 10),
    maxInvitesPerWeek: num(s.get("max_invites_per_week"), 100),
    maxMessagesPerDay: num(s.get("max_messages_per_day"), 50),
    maxInviteNotesPerWeek: num(s.get("max_invite_notes_per_week"), 15),
    inviteNoteMaxChars: num(s.get("invite_note_max_chars"), 200),
    delayMinSeconds: num(s.get("delay_min_seconds"), 30),
    delayMaxSeconds: num(s.get("delay_max_seconds"), 120),
    searchPageSize: num(s.get("search_page_size"), 10),
    schedule: {
      workDays: Array.isArray(workDays) && workDays.every((d) => typeof d === "number") ? (workDays as number[]) : DEFAULT_SCHEDULE.workDays,
      start: typeof hours?.start === "string" ? hours.start : DEFAULT_SCHEDULE.start,
      end: typeof hours?.end === "string" ? hours.end : DEFAULT_SCHEDULE.end,
      timezone: typeof s.get("timezone") === "string" ? (s.get("timezone") as string) : DEFAULT_SCHEDULE.timezone,
      skipDutchHolidays: s.get("skip_dutch_holidays") !== false,
    },
  };
}
