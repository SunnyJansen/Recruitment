"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type Item = { label: string; href: string };

function isCurrent(href: string, pathname: string | null) {
  if (!pathname) return false;
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Weergave van de navigatie; pathname null = nog onbekend (tijdens laden). */
function NavTabsView({ items, pathname }: { items: Item[]; pathname: string | null }) {
  return (
    <nav aria-label="Hoofdnavigatie" className="flex flex-wrap gap-0.5 rounded-field bg-surface-raised p-0.5">
      {items.map((item) => {
        const current = isCurrent(item.href, pathname);
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

/**
 * NavTabs — hoofdnavigatie in de vorm van een segmented control:
 * 36 hoog, track surface-raised, radius 10. Huidige pagina krijgt een vlak.
 * Leest het adres, dus in de layout binnen <Suspense> met NavTabsFallback.
 */
function NavTabs({ items }: { items: Item[] }) {
  return <NavTabsView items={items} pathname={usePathname()} />;
}

/** Zelfde navigatie zonder markering, getoond terwijl de pagina laadt. */
function NavTabsFallback({ items }: { items: Item[] }) {
  return <NavTabsView items={items} pathname={null} />;
}

export { NavTabs, NavTabsFallback };
