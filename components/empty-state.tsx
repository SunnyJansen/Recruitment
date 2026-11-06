import type { LucideIcon } from "lucide-react";

/** Lege toestand in een paneel: icoon, korte titel en uitleg. */
export function EmptyState({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-tile bg-surface-raised px-6 py-12 text-center">
      <Icon className="size-6 text-muted-foreground" aria-hidden />
      <p className="text-app-body">{title}</p>
      {children && <p className="max-w-md text-[13px] text-muted-foreground">{children}</p>}
    </div>
  );
}
