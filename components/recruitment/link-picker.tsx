"use client";

import { Link2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { linkCandidateToVacancy } from "@/app/(app)/kandidaten/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

/**
 * Koppelt een kandidaat aan een vacature. Werkt vanaf beide kanten:
 * - op de vacaturepagina kies je een kandidaat (fixed = vacancy)
 * - op de kandidaatpagina kies je een vacature (fixed = candidate)
 */
export function LinkPicker({
  fixed,
  fixedId,
  options,
  label,
  emptyText,
}: {
  fixed: "vacancy" | "candidate";
  fixedId: string;
  options: { id: string; label: string }[];
  label: string;
  emptyText: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (options.length === 0) return <p className="text-[13px] text-muted-foreground">{emptyText}</p>;

  function onLink() {
    if (!selected) {
      setMessage("Kies eerst een optie.");
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const [candidateId, vacancyId] = fixed === "vacancy" ? [selected, fixedId] : [fixedId, selected];
      const result = await linkCandidateToVacancy(candidateId, vacancyId);
      if (!result.ok) setMessage(result.message ?? "Koppelen is mislukt.");
      else setSelected("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`link-${fixedId}`}>{label}</Label>
      <div className="flex flex-wrap gap-2">
        <div className="min-w-[220px] flex-1">
          <Select id={`link-${fixedId}`} value={selected} onChange={(e) => setSelected(e.target.value)} disabled={pending}>
            <option value="">Kies…</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <Button type="button" variant="tinted" onClick={onLink} disabled={pending}>
          <Link2 />
          {pending ? "Koppelen…" : "Koppel"}
        </Button>
      </div>
      {message && (
        <p role="alert" className="text-[12px] text-danger-text">
          {message}
        </p>
      )}
    </div>
  );
}
