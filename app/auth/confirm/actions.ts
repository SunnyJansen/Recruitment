"use server";

import { redirect } from "next/navigation";

import { linkErrorKind, safeNext } from "@/lib/auth/auth-links";
import { logActivity } from "@/lib/db/log";
import { createClient } from "@/lib/db/server";

/**
 * Logt in met de token uit de mail (?token_hash=…). Dit gebeurt pas als de
 * gebruiker op de knop klikt, zodat een virusscanner die de link opent hem
 * niet "opgebruikt". Werkt in elke browser.
 */
export async function confirmLogin(formData: FormData) {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const type = String(formData.get("type") ?? "email");
  const next = safeNext(String(formData.get("next") ?? "/"));

  if (!tokenHash) redirect("/login?error=link");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type === "magiclink" ? "magiclink" : "email",
  });

  if (error || !data.user) {
    console.error("Inloggen met token mislukt:", error?.code, error?.message);
    redirect(`/login?error=${linkErrorKind({ code: error?.code, message: error?.message })}`);
  }

  await logActivity(supabase, {
    actor: "user",
    actorId: data.user.id,
    action: "login",
    entity: "user",
    entityId: data.user.id,
    details: { method: "magic_link_token" },
  });
  redirect(next);
}
