import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { createClient } from "@/lib/db/server";
import type { ImportStatus } from "@/lib/db/types";
import { isUuid } from "@/lib/domain/form-state";
import type { ImportProgress } from "@/lib/queue/import";

import { ImportRunner } from "./import-runner";

export const metadata = { title: "Importeren — Cr8las Recruitment" };

export default async function ImportPage({ params }: PageProps<"/vacatures/[id]/import">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const { data: v } = await supabase.from("vacancies").select("id, title").eq("id", id).maybeSingle();
  if (!v) notFound();

  const { data: rows } = await supabase
    .from("import_queue")
    .select("id, name, status, result, candidate_id, processed_at")
    .eq("vacancy_id", id)
    .order("created_at", { ascending: false })
    .limit(200);
  const counts: Record<ImportStatus, number> = { pending: 0, processing: 0, done: 0, skipped: 0, failed: 0 };
  for (const r of rows ?? []) counts[r.status]++;
  const initial: ImportProgress = {
    state: counts.pending || counts.processing ? "waiting" : "finished",
    counts,
    items: rows ?? [],
  };

  return (
    <>
      <Panel
        title="LinkedIn-import"
        subtitle={v.title}
        actions={
          <Button asChild variant="bordered">
            <Link href={`/vacatures/${id}/zoeken`}>
              <ArrowLeft />
              Terug naar zoeken
            </Link>
          </Button>
        }
      />
      <ImportRunner vacancyId={id} initial={initial} />
    </>
  );
}
