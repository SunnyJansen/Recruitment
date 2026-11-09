import * as React from "react";

import { cn } from "@/lib/utils";

/** TextArea — meerregelig veld in dezelfde stijl als Input (radius 10). */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-24 w-full rounded-field border border-input-stroke bg-input-fill px-3 py-2.5 text-app-body text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground placeholder:font-normal",
        "focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-accent-tint",
        "disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger-text",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
