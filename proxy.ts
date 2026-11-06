import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/db/session";

/**
 * Next.js 16 "proxy" (vroeger middleware): beschermt alle pagina's achter de login.
 * Webhooks en cron-routes (/api/...) regelen later hun eigen beveiliging.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
