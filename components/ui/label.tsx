"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";

import { cn } from "@/lib/utils";

/** Label — altijd 11 Semibold in hoofdletters, text-muted (field-label). */
function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn("text-field-label block text-muted-foreground select-none", className)}
      {...props}
    />
  );
}

export { Label };
