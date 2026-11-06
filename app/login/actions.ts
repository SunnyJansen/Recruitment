"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { safeNext } from "@/lib/auth/auth-links";
import {
  isPasswordMode,
  passwordMatches,
  SITE_COOKIE,
  SITE_COOKIE_MAX_AGE,
  siteToken,
} from "@/lib/auth/site-password";
import { logActivity } from "@/lib/db/log";
import { createClient } from "@/lib/db/server";

export type PasswordState = { error: string | null };

/** Inloggen in de tijdelijke wachtwoordmodus. */
export async function loginWithPassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  if (!isPasswordMode()) return { error: "Inloggen met wachtwoord staat uit." };

  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? "/"));
  const supabase = await createClient();

  if (!(await passwordMatches(password))) {
    await logActivity(supabase, { actor: "user", action: "login_failed", entity: "site", details: { method: "site_password" } });
    // Even wachten maakt raden met een script onaantrekkelijk.
    await new Promise((r) => setTimeout(r, 1000));
    return { error: "Dit wachtwoord klopt niet." };
  }

  (await cookies()).set(SITE_COOKIE, await siteToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SITE_COOKIE_MAX_AGE,
  });
  await logActivity(supabase, { actor: "user", action: "login", entity: "site", details: { method: "site_password" } });
  redirect(next);
}
