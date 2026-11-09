"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setStage } from "@/app/(app)/kandidaten/actions";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import type { Stage } from "@/lib/db/types";
import { SELECTABLE_STAGES, STAGES } from "@/lib/domain/labels";

/**
 * Fase van een kandidaat binnen een vacature. Wijzigen slaat direct op.
 * Afgemelde kandidaten tonen alleen een badge: die kun je niet meer verplaatsen.
 */
export function StageSelect({
  candidateId,
  vacancyId,
  stage,
  label,
}: {
  candidateId: string;
  vacancyId: string;
  stage: Stage;
  /** Toegankelijke naam, bijv. "Fase van Jan bij TIG-lasser". */
  label: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState<Stage>(stage);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (stage === "opted_out") return <Badge tone="red">{STAGES.opted_out.label}</Badge>;

  function onChange(next: Stage) {
    const previous = value;
    setValue(next);
    setError(null);
    startTransition(async () => {
      const result = await setStage(candidateId, vacancyId, next);
      if (!result.ok) {
        setValue(previous);
        setError(result.message ?? "Opslaan is mislukt.");
      }
      router.refresh();
    });
  }

  return (
    <div className="flex min-w-[150px] flex-col gap-1">
      <Select
        aria-label={label}
        value={value}
        disabled={pending}
        onChange={(e) => onChange(e.target.value as Stage)}
        className="h-8 text-[13px]"
      >
        {SELECTABLE_STAGES.map((s) => (
          <option key={s} value={s}>
            {STAGES[s].label}
          </option>
        ))}
      </Select>
      {error && <span className="text-[12px] text-danger-text">{error}</span>}
    </div>
  );
}
