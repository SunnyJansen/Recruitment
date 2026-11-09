import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { createClient } from "@/lib/db/server";
import { isUuid } from "@/lib/domain/form-state";
import { readRequirements } from "@/lib/domain/forms";
import { loadSettings } from "@/lib/settings";
import { getUnipileConfig } from "@/lib/unipile/client";

import { SearchClient } from "./search-client";

export const metadata = { title: "Zoeken op LinkedIn — Cr8las Recruitment" };

/** Trefwoorden voorstellen op basis van de vacature, bijv. "TIG RVS". */
function suggestKeywords(lasprocessen: string[], materialen: string[]) {
  const processes = lasprocessen.map((p) => p.replace(/\s*\(.*\)\s*/, "").trim()).filter(Boolean);
  return [...processes, ...materialen].slice(0, 4).join(" ");
}

export default async function ZoekenPage({ params }: PageProps<"/vacatures/[id]/zoeken">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const { data: v } = await supabase.from("vacancies").select("id, title, location, requirements").eq("id", id).maybeSingle();
  if (!v) notFound();

  const { missing, problem } = getUnipileConfig();
  const back = (
    <Button asChild variant="bordered">
      <Link href={`/vacatures/${id}`}>
        <ArrowLeft />
        Terug naar vacature
      </Link>
    </Button>
  );

  if (problem) {
    return (
      <Panel title="Unipile-instelling klopt niet" subtitle={v.title} actions={back}>
        <p role="alert" className="text-app-body text-danger-text">{problem}</p>
        <p className="text-app-meta text-muted-foreground">Stap voor stap: docs/UNIPILE-INSTELLEN.md in GitHub.</p>
      </Panel>
    );
  }

  if (missing.length) {
    return (
      <Panel title="LinkedIn nog niet gekoppeld" subtitle={v.title} actions={back}>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-app-body">
          <li>Maak een account op unipile.com en koppel je LinkedIn-testaccount.</li>
          <li>
            Zet in Vercel (Settings → Environment Variables):{" "}
            {missing.map((m, i) => (
              <span key={m}>
                {i > 0 && ", "}
                <code className="rounded bg-surface-raised px-1.5">{m}</code>
              </span>
            ))}
            .
          </li>
          <li>Klik in Vercel op Deployments → ⋯ → Redeploy.</li>
        </ol>
        <p className="text-app-meta text-muted-foreground">Stap voor stap: docs/UNIPILE-INSTELLEN.md in GitHub.</p>
      </Panel>
    );
  }

  const settings = await loadSettings(supabase);
  const [{ data: searchUsed }, { data: viewsUsed }] = await Promise.all([
    supabase.rpc("linkedin_count", { p_kind: "search", p_period: "day" }),
    supabase.rpc("linkedin_count", { p_kind: "profile_view", p_period: "day" }),
  ]);
  const r = readRequirements(v.requirements);

  return (
    <>
      <Panel title="Zoeken op LinkedIn" subtitle={v.title} actions={back} />
      <SearchClient
        vacancyId={id}
        initial={{ keywords: suggestKeywords(r.lasprocessen, r.materialen), title: v.title, location: v.location ?? "" }}
        usage={{
          searchUsed: searchUsed ?? 0,
          searchLimit: settings.maxSearchResultsPerDay,
          viewsUsed: viewsUsed ?? 0,
          viewsLimit: settings.maxProfileViewsPerDay,
        }}
      />
    </>
  );
}
