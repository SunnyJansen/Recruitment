"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * NavTabs — hoofdnavigatie in de vorm van een segmented control:
 * 36 hoog, track surface-raised, radius 10. Huidige pagina krijgt een vlak.
 */
function NavTabs({ items }: { items: { label: string; href: string }[] }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Hoofdnavigatie"
      className="flex flex-wrap gap-0.5 rounded-field bg-surface-raised p-0.5"
    >
      {items.map((item) => {
        const current =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "flex h-8 items-center rounded-[8px] px-3 text-[14px] font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring",
              current
                ? "bg-[color-mix(in_srgb,var(--text-strong)_12%,transparent)] text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export { NavTabs };
