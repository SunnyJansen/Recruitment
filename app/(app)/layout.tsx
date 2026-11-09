import { LogOut } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { NavTabs, NavTabsFallback } from "@/components/ui/nav-tabs";
import { getCurrentUser } from "@/lib/db/server";

const NAV = [
  { label: "Dashboard", href: "/" },
  { label: "Vacatures", href: "/vacatures" },
  { label: "Kandidaten", href: "/kandidaten" },
  { label: "Berichten", href: "/berichten" },
  { label: "Instellingen", href: "/instellingen" },
];

/** Ingelogde gebruiker + uitlogknop. Leest de sessie, dus staat in Suspense. */
async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <span className="hidden text-app-meta text-muted-foreground sm:inline" title="Ingelogd als">
      {user.email}
    </span>
  );
}

/** Paginaopbouw: kopbalk (titel, navigatie, gebruiker, thema) → inhoud. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col gap-5 p-4 md:p-6">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-surface border border-surface-border bg-surface px-5 py-3 shadow-surface backdrop-blur-[24px]">
        <h1 className="text-app-title">Cr8las Recruitment</h1>
        <Suspense fallback={<NavTabsFallback items={NAV} />}>
          <NavTabs items={NAV} />
        </Suspense>
        <div className="ml-auto flex items-center gap-2">
          <Suspense fallback={null}>
            <UserMenu />
          </Suspense>
          <ThemeToggle />
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="bordered" size="icon" aria-label="Uitloggen" title="Uitloggen">
              <LogOut />
            </Button>
          </form>
        </div>
      </header>
      <main className="flex flex-col gap-5">{children}</main>
    </div>
  );
}
