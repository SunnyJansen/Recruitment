import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StatGroup } from "@/components/ui/stat-group";
import { createClient } from "@/lib/db/server";
import type { CampaignQuery, OutreachStatus } from "@/lib/db/types";
import { isUuid } from "@/lib/domain/form-state";
import { readRequirements } from "@/lib/domain/forms";
import { DEFAULT_TEMPLATE_EN, DEFAULT_TEMPLATE_NL } from "@/lib/domain/templates";
import { loadSettings } from "@/lib/settings";
import { unipileSetupProblem } from "@/lib/unipile/client";

import { CampaignClient } from "./campaign-client";

export const metadata = { title: "Automatisch benaderen — Cr8las Recruitment" };

export default async function AutomatischPage({ params }: PageProps<"/vacatures/[id]/automatisch">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const { data: v } = await supabase.from("vacancies").select("id, title, location, requirements").eq("id", id).maybeSingle();
  if (!v) notFound();

  const [{ data: campaign }, { data: links }, { data: settingRows }, settings, { data: invitesToday }, { data: messagesToday }] =
    await Promise.all([
      supabase.from("campaigns").select("*").eq("vacancy_id", id).maybeSingle(),
      supabase.from("candidate_vacancy").select("outreach_status").eq("vacancy_id", id).not("outreach_status", "is", null),
      supabase.from("settings").select("key, value").in("key", ["sender_name", "sender_title", "company_name"]),
      loadSettings(supabase),
      supabase.rpc("linkedin_count", { p_kind: "invite", p_period: "day" }),
      supabase.rpc("linkedin_count", { p_kind: "message", p_period: "day" }),
    ]);

  const counts: Record<OutreachStatus, number> = { pending: 0, invited: 0, connected: 0, messaged: 0, replied: 0, failed: 0, skipped: 0 };
  for (const l of links ?? []) if (l.outreach_status) counts[l.outreach_status]++;
  const setting = (k: string) => {
    const val = settingRows?.find((r) => r.key === k)?.value;
    return typeof val === "string" ? val : "";
  };
  const r = readRequirements(v.requirements);
  const suggested = [...r.lasprocessen.map((p) => p.replace(/\s*\(.*\)\s*/, "")), ...r.materialen].slice(0, 4).join(" ");
  const query = (campaign?.search_query ?? { keywords: suggested, title: v.title }) as CampaignQuery;
  const setupProblem = unipileSetupProblem();
  const cronReady = Boolean(process.env.CRON_SECRET && process.env.SUPABASE_SERVICE_ROLE_KEY);

  return (
    <>
      <Panel
        title="Automatisch benaderen"
        subtitle={v.title}
        actions={
          <Button asChild variant="bordered">
            <Link href={`/vacatures/${id}`}>
              <ArrowLeft />
              Terug naar vacature
            </Link>
          </Button>
        }
      >
        <ol className="flex list-decimal flex-col gap-1 pl-5 text-[13px] text-muted-foreground">
          <li>Elke werkdag zoekt het systeem nieuwe kandidaten met jouw zoekopdracht.</li>
          <li>Het stuurt een uitnodiging zonder tekst (gratis LinkedIn-account), max. {settings.maxInvitesPerDay} per dag.</li>
          <li>Wie accepteert, krijgt automatisch jouw goedgekeurde bericht (met bronvermelding en afmeldzin).</li>
          <li>Wie reageert, verschijnt op je dashboard. Reageert iemand met &quot;geen interesse&quot;, dan wordt die kandidaat direct afgemeld.</li>
        </ol>
        {setupProblem && <p className="text-[13px] text-danger-text">{setupProblem}</p>}
        {!cronReady && (
          <p className="text-[13px] text-danger-text">
            De dagelijkse automatische uitvoering is nog niet ingesteld (CRON_SECRET en SUPABASE_SERVICE_ROLE_KEY in Vercel + cron-job.org). Zie
            docs/AUTOMATISCH-BENADEREN.md.
          </p>
        )}
      </Panel>

      <StatGroup
        items={[
          { label: "Gereageerd", value: counts.replied, note: "Zichtbaar op je dashboard" },
          { label: "Uitgenodigd", value: counts.invited + counts.connected + counts.messaged + counts.replied, note: `Vandaag ${invitesToday ?? 0} van ${settings.maxInvitesPerDay}` },
          { label: "Bericht gestuurd", value: counts.messaged + counts.replied, note: `Vandaag ${messagesToday ?? 0} van ${settings.maxMessagesPerDay}` },
          { label: "Klaar om uit te nodigen", value: counts.pending, note: counts.failed ? `${counts.failed} mislukt/verlopen` : undefined },
        ]}
      />

      <CampaignClient
        vacancyId={id}
        vacancy={{ title: v.title, location: v.location }}
        sender={{ name: setting("sender_name"), title: setting("sender_title"), company: setting("company_name") }}
        initial={{
          status: campaign?.status ?? null,
          approvedLabel: campaign?.approved_by_label ?? null,
          approvedAt: campaign?.approved_at ?? null,
          query,
          templateNl: campaign?.template_nl || DEFAULT_TEMPLATE_NL,
          templateEn: campaign?.template_en || DEFAULT_TEMPLATE_EN,
        }}
      />
    </>
  );
}
