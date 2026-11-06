import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Button — Sunny Apple dashboardstijl: capsule van 36 hoog, tekst 14 Semibold,
 * optioneel icoon van 16 vóór de tekst.
 * - default: hoofdactie (accent + gloed). Max. één of twee per scherm.
 * - bordered: secundaire actie.
 * - destructive: verwijderen, altijd als laatste.
 * - tinted: valt op zonder hoofdactie te zijn.
 * - borderless: lichte actie in lijsten.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full text-[14px] font-semibold transition-[background-color,box-shadow,opacity] outline-none focus-visible:ring-[3.5px] focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 active:opacity-85 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-accent-glow",
        bordered:
          "bg-surface-raised text-foreground border border-surface-border hover:bg-[color-mix(in_srgb,var(--surface-raised),var(--text-strong)_6%)]",
        destructive: "bg-danger-tint text-danger-text border border-danger-stroke",
        tinted: "bg-accent-tint text-accent-text",
        borderless: "text-accent-text hover:bg-surface-raised",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-7 px-3 text-[13px]",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "bordered",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
