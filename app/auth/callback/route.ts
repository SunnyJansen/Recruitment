import { NextResponse } from "next/server";

import { linkErrorKind, safeNext } from "@/lib/auth/auth-links";
import { logActivity } from "@/lib/db/log";
import { createClient } from "@/lib/db/server";

/**
 * Standaard Supabase-inloglink (?code=…). We wisselen de code in voor een
 * sessie, loggen de login en sturen je door. Werkt alleen in dezelfde browser
 * waar de link is aangevraagd; anders krijg je een duidelijke uitleg.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

  const fail = (kind: string) => NextResponse.redirect(new URL(`/login?error=${kind}`, url.origin));

  // Supabase meldt soms zelf al een fout (bijv. verlopen link).
  const supabaseError = url.searchParams.get("error_code") ?? url.searchParams.get("error");
  if (!code) return fail(linkErrorKind({ code: supabaseError }));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    console.error("Inloggen met code mislukt:", error?.code, error?.message);
    return fail(linkErrorKind({ code: error?.code, message: error?.message }));
  }

  await logActivity(supabase, {
    actor: "user",
    actorId: data.user.id,
    action: "login",
    entity: "user",
    entityId: data.user.id,
    details: { method: "magic_link_code" },
  });
  return NextResponse.redirect(new URL(next, url.origin));
}
