import * as React from "react";

import { cn } from "@/lib/utils";

type Stat = { label: string; value: React.ReactNode; note?: React.ReactNode };

/**
 * StatGroup — kerncijferstrook. Het eerste (of highlight-)cijfer staat op
 * surface-raised. Belangrijkste waarde eerst.
 */
function StatGroup({
  items,
  highlight = 0,
  className,
}: {
  items: Stat[];
  highlight?: number;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "grid grid-cols-2 gap-2 rounded-surface border border-surface-border bg-surface p-2 shadow-surface backdrop-blur-[24px] md:grid-cols-4",
        className,
      )}
    >
      {items.map((s, i) => (
        <div
          key={s.label}
          className={cn("rounded-tile px-3.5 py-3", i === highlight && "bg-surface-raised")}
        >
          <div className="text-field-label text-muted-foreground">{s.label}</div>
          <div className="mt-1 text-stat-value">{s.value}</div>
          {s.note && <div className="text-app-meta text-muted-foreground">{s.note}</div>}
        </div>
      ))}
    </section>
  );
}

export { StatGroup };
