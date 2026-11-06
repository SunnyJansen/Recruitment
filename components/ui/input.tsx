import * as React from "react";

import { cn } from "@/lib/utils";

/** Input — veld van 38 hoog, radius 10, focus met accentrand en tintring. */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-[38px] w-full min-w-0 rounded-field border border-input-stroke bg-input-fill px-3 text-app-body text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground placeholder:font-normal",
        "focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-accent-tint",
        "disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger-text",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
