import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { isPasswordMode, SITE_COOKIE } from "@/lib/auth/site-password";
import { logActivity } from "@/lib/db/log";
import { createClient } from "@/lib/db/server";

/** Uitloggen (POST vanuit het formulier in de kopbalk). */
export async function POST(request: Request) {
  const supabase = await createClient();

  if (isPasswordMode()) {
    await logActivity(supabase, { actor: "user", action: "logout", entity: "site", details: { method: "site_password" } });
    (await cookies()).delete(SITE_COOKIE);
    return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  }

  const { data } = await supabase.auth.getUser();
  if (data.user) {
    await logActivity(supabase, {
      actor: "user",
      actorId: data.user.id,
      action: "logout",
      entity: "user",
      entityId: data.user.id,
    });
  }
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
