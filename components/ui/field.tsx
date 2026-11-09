import * as React from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Field (LabeledField) — label in hoofdletters boven een control, met
 * optionele hulptekst en foutmelding. Afstand label → veld 8.
 */
function Field({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p id={htmlFor ? `${htmlFor}-error` : undefined} className="text-[12px] text-danger-text">
          {error}
        </p>
      ) : hint ? (
        <p className="text-app-meta text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export { Field };
