import { cn } from "@/lib/utils";

/**
 * ChipGroup met aanvinkbare chips (28 hoog, capsule). Gewone checkboxes onder
 * de motorkap, dus het formulier werkt ook zonder JavaScript en met toetsenbord.
 */
function ChipCheckboxGroup({
  name,
  options,
  defaultValue = [],
  label,
}: {
  name: string;
  options: readonly string[];
  defaultValue?: string[];
  label: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-field-label text-muted-foreground">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label key={option} className="cursor-pointer">
            <input
              type="checkbox"
              name={name}
              value={option}
              defaultChecked={defaultValue.includes(option)}
              className="peer sr-only"
            />
            <span
              className={cn(
                "inline-flex h-7 items-center rounded-full border border-surface-border bg-surface-raised px-3 text-[13px] font-medium text-muted-foreground transition-colors select-none",
                "peer-checked:border-transparent peer-checked:bg-chip-active peer-checked:text-chip-active-text",
                "peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring",
              )}
            >
              {option}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export { ChipCheckboxGroup };
