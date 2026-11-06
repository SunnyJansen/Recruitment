"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

type Theme = "dark" | "light";

function readTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

/** Schakelt tussen donker (standaard) en licht thema en onthoudt de keuze. */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "dark" as Theme);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Opslaan mag mislukken (bijv. privévenster); het thema werkt dan alleen deze sessie.
    }
  }

  return (
    <Button
      variant="bordered"
      size="icon"
      onClick={toggle}
      aria-label={theme === "dark" ? "Schakel naar licht thema" : "Schakel naar donker thema"}
      title={theme === "dark" ? "Licht thema" : "Donker thema"}
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}

/** Script dat vóór het tekenen het bewaarde thema zet, zodat er niets knippert. */
export const themeInitScript = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;}catch(e){}`;
