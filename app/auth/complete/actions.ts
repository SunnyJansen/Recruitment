"use server";

import { logActivity } from "@/lib/db/log";
import { createClient } from "@/lib/db/server";

/** Legt een geslaagde login vast in activity_log (AVG: log elke actie). */
export async function logLogin() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await logActivity(supabase, {
    actor: "user",
    actorId: data.user.id,
    action: "login",
    entity: "user",
    entityId: data.user.id,
    details: { method: "magic_link" },
  });
}
