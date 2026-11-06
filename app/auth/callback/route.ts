import { NextResponse } from "next/server";

import { logActivity } from "@/lib/db/log";
import { createClient } from "@/lib/db/server";

/**
 * Hier komt de inloglink uit de e-mail op uit. We wisselen de code in voor
 * een sessie, loggen de login en sturen je door.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next") ?? "/";
  // Alleen interne paden toestaan (geen doorsturen naar andere websites).
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      await logActivity(supabase, {
        actor: "user",
        actorId: data.user.id,
        action: "login",
        entity: "user",
        entityId: data.user.id,
      });
      return NextResponse.redirect(new URL(next, url.origin));
    }
  }

  return NextResponse.redirect(new URL("/login?error=link", url.origin));
}
