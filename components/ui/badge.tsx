import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Badge — status van een item. 20 hoog, radius 6, tekst 12 Semibold.
 * Gebruik per status altijd dezelfde toon (zie docs/DESIGN.md).
 */
const badgeVariants = cva(
  "inline-flex h-5 items-center rounded-[6px] px-2 text-[12px] font-semibold whitespace-nowrap",
  {
    variants: {
      tone: {
        blue: "bg-accent-tint text-accent-text",
        green: "bg-success-tint text-success",
        red: "bg-danger-tint text-danger-text",
        gray: "bg-surface-raised text-muted-foreground",
      },
    },
    defaultVariants: { tone: "gray" },
  },
);

function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { Badge, badgeVariants };
