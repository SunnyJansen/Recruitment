import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Table — kolomkoppen 11 Semibold hoofdletters, cellen 14 Medium,
 * scheidingslijn surface-border, hover surface-raised. Scrolt op smalle
 * schermen in zijn eigen vak.
 */
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className={cn("w-full border-collapse text-left", className)} {...props} />
    </div>
  );
}

function THead(props: React.ComponentProps<"thead">) {
  return <thead {...props} />;
}

function TBody(props: React.ComponentProps<"tbody">) {
  return <tbody {...props} />;
}

function TR({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      className={cn("border-b border-surface-border last:border-0 [tbody>&]:hover:bg-surface-raised", className)}
      {...props}
    />
  );
}

function TH({ className, align, ...props }: Omit<React.ComponentProps<"th">, "align"> & { align?: "start" | "end" }) {
  return (
    <th
      className={cn(
        "p-3 text-field-label whitespace-nowrap text-muted-foreground",
        align === "end" && "text-right",
        className,
      )}
      {...props}
    />
  );
}

function TD({
  className,
  align,
  muted,
  ...props
}: Omit<React.ComponentProps<"td">, "align"> & { align?: "start" | "end"; muted?: boolean }) {
  return (
    <td
      className={cn(
        "p-3 align-middle text-app-body",
        align === "end" && "text-right tabular-nums",
        muted && "text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Table, TBody, TD, TH, THead, TR };
