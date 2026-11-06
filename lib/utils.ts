import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge kent onze Sunny Apple-tekststijlen (text-app-title, …) niet
 * en zou ze anders als kleur zien en weggooien naast bijv. text-muted-foreground.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        { text: ["app-title", "panel-title", "band-title", "stat-value", "field-label", "app-body", "app-meta"] },
      ],
    },
  },
});

/** Voegt Tailwind-classes samen zonder conflicten (standaard shadcn/ui-helper). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
