import { cn } from "@/lib/utils";

/** One facet as a row of small segments; exactly one is pressed. */
export function FacetControl<TValue extends string>({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: TValue;
  readonly options: readonly {
    readonly value: TValue;
    readonly label: string;
  }[];
  readonly onChange: (value: TValue) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex items-center gap-1 text-[0.6875rem]"
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="flex overflow-hidden rounded-sm border">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === value}
            className={cn(
              "px-1.5 py-0.5 text-muted-foreground hover:text-foreground",
              option.value === value && "bg-input/50 text-foreground",
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </span>
    </div>
  );
}
