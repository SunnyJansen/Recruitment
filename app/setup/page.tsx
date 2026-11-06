import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { Panel } from "@/components/ui/panel";
import { isPasswordMode } from "@/lib/auth/site-password";
import { hasSupabaseEnv } from "@/lib/db/env";

export const metadata = { title: "Instellen — Cr8las Recruitment" };

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-surface-raised px-1.5">{children}</code>;
}

/** Wordt getoond zolang er sleutels in Vercel ontbreken. */
export default function SetupPage() {
  return (
    <Suspense>
      <SetupContent />
    </Suspense>
  );
}

async function SetupContent() {
  await connection(); // sleutels per verzoek controleren, niet tijdens het bouwen
  const missing: React.ReactNode[] = [];
  if (!hasSupabaseEnv()) {
    missing.push(<Code key="url">NEXT_PUBLIC_SUPABASE_URL</Code>, <Code key="anon">NEXT_PUBLIC_SUPABASE_ANON_KEY</Code>);
  }
  if (isPasswordMode() && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    missing.push(<Code key="svc">SUPABASE_SERVICE_ROLE_KEY</Code>);
  }
  if (missing.length === 0) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Panel
        className="w-full max-w-[560px]"
        title="Nog één stap"
        subtitle="De app mist nog sleutels om met de Supabase-database te praten."
      >
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-app-body">
          <li>
            Open in Vercel je project → <strong>Settings → Environment Variables</strong>.
          </li>
          <li>
            Voeg toe:{" "}
            {missing.map((m, i) => (
              <span key={i}>
                {i > 0 && ", "}
                {m}
              </span>
            ))}
            . Je vindt ze in Supabase onder Project Settings → API Keys.
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
