import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Panel — basisvlak van de dashboardstijl: doorschijnende kaart met rand,
 * radius 20, padding 20, gap 16. Optioneel titel, ondertitel en acties.
 */
function Panel({
  title,
  subtitle,
  actions,
  compact = false,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"section">, "title"> & {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** Kleinere titel (20/26), voor de kopbalk. */
  compact?: boolean;
}) {
  const hasHeader = title || subtitle || actions;
  return (
    <section
      data-slot="panel"
      className={cn(
        "flex flex-col gap-4 rounded-surface border border-surface-border bg-surface p-5 shadow-surface backdrop-blur-[24px] backdrop-saturate-[1.2]",
        className,
      )}
      {...props}
    >
      {hasHeader && (
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            {title && (
              <h2 className={compact ? "text-app-title" : "text-panel-title"}>{title}</h2>
            )}
            {subtitle && <p className="mt-0.5 text-[13px] text-muted-foreground">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export { Panel };
