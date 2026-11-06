import { redirect } from "next/navigation";

import { Panel } from "@/components/ui/panel";
import { hasSupabaseEnv } from "@/lib/db/env";

export const metadata = { title: "Instellen — Cr8las Recruitment" };

/** Wordt getoond zolang de Supabase-gegevens in .env.local ontbreken. */
export default function SetupPage() {
  if (hasSupabaseEnv()) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Panel
        className="w-full max-w-[560px]"
        title="Nog één stap"
        subtitle="De app weet nog niet met welke Supabase-database hij moet praten."
      >
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-app-body">
          <li>
            Open in Vercel je project → <strong>Settings → Environment Variables</strong>.
          </li>
          <li>
            Voeg <code className="rounded bg-surface-raised px-1.5">NEXT_PUBLIC_SUPABASE_URL</code> en{" "}
            <code className="rounded bg-surface-raised px-1.5">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> toe. Je vindt
            ze in Supabase onder Project Settings → API Keys.
          </li>
          <li>
            Ga naar <strong>Deployments</strong>, klik bij de bovenste op de drie puntjes →{" "}
            <strong>Redeploy</strong>. Pas na een nieuwe build kent de app de sleutels.
          </li>
        </ol>
        <p className="text-app-meta text-muted-foreground">Uitgebreide stappen staan in README.md.</p>
      </Panel>
    </main>
  );
}
