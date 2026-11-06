import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "./types";

/**
 * Schrijft een regel in activity_log (AVG-regel: log elke actie).
 * Gooit geen fout: een mislukte logregel mag de actie zelf niet breken,
 * maar wordt wel in de serverlog gemeld.
 */
export async function logActivity(
  supabase: SupabaseClient<Database>,
  entry: {
    actor: "user" | "system";
    actorId?: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    details?: Json;
  },
) {
  const { error } = await supabase.from("activity_log").insert({
    actor: entry.actor,
    actor_id: entry.actorId ?? null,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entityId ?? null,
    details: entry.details ?? {},
  });
  if (error) console.error("activity_log mislukt:", error.message, entry);
}
