import { ChevronDown } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Select — keuzelijst (native, werkt overal ook zonder JavaScript),
 * 38 hoog zoals de velden.
 */
function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        data-slot="select"
        className={cn(
          "h-[38px] w-full min-w-0 appearance-none rounded-field border border-input-stroke bg-input-fill pr-9 pl-3 text-app-body text-foreground outline-none transition-[border-color,box-shadow]",
          "focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-accent-tint",
          "disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger-text",
          "[&>option]:bg-surface-solid [&>option]:text-foreground",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

export { Select };
