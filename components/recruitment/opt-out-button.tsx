"use client";

import { Ban } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { optOutCandidate } from "@/app/(app)/kandidaten/actions";
import { Button } from "@/components/ui/button";

/**
 * Afmelden in twee stappen (eerst vragen, dan doen), omdat het niet terug te
 * draaien is: de kandidaat wordt daarna nooit meer benaderd.
 */
export function OptOutButton({ candidateId, name }: { candidateId: string; name: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <Button variant="destructive" onClick={() => setConfirming(true)}>
        <Ban />
        Afmelden…
      </Button>
    );
  }

  return (
    <div
      role="alertdialog"
      aria-labelledby="optout-title"
      className="flex w-full flex-col gap-3 rounded-tile border border-danger-stroke bg-danger-tint p-4"
    >
      <p id="optout-title" className="text-app-body">
        {name} afmelden?
      </p>
      <p className="text-[13px] text-muted-foreground">
        Deze kandidaat wordt nooit meer benaderd. Open concepten en opvolging worden geannuleerd. Dit kun je
        niet ongedaan maken.
      </p>
      {error && <p className="text-[13px] text-danger-text">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="bordered" onClick={() => setConfirming(false)} disabled={pending}>
          Annuleer
        </Button>
        <Button
          variant="destructive"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await optOutCandidate(candidateId);
              if (!result.ok) setError(result.message ?? "Afmelden is mislukt.");
              else setConfirming(false);
              router.refresh();
            })
          }
        >
          <Ban />
          {pending ? "Afmelden…" : "Ja, afmelden"}
        </Button>
      </div>
    </div>
  );
}
