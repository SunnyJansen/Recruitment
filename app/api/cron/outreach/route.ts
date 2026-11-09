import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/db/admin";
import { runOutreachTick } from "@/lib/queue/outreach";

/**
 * Wordt elke paar minuten aangeroepen door een externe cron-dienst
 * (bijv. cron-job.org). Beveiligd met CRON_SECRET in de header:
 *   Authorization: Bearer <CRON_SECRET>
 * Elke aanroep doet hoogstens één LinkedIn-actie (zie lib/queue/outreach.ts).
 */
export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  if (secret.length < 16) return false;
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : (request.headers.get("x-cron-secret") ?? "");
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET ontbreekt in Vercel." }, { status: 500 });
  }
  if (!authorized(request)) return NextResponse.json({ error: "Geen toegang." }, { status: 401 });

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY ontbreekt in Vercel." }, { status: 500 });
  }
  const report = await runOutreachTick(supabase);
  return NextResponse.json(report, { status: report.state === "error" ? 500 : 200 });
}

export const GET = handle;
export const POST = handle;
