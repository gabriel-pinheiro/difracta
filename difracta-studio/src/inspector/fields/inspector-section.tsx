import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { isBoolean, useStoredState } from "@/lib/storage";

/**
 * A collapsible group of inspector rows. The open state is remembered per
 * section name, not per entity, so collapsing Parameters on one Layer
 * collapses them on every Layer until reopened.
 */
export function InspectorSection({
  storageKey,
  label,
  actions,
  children,
}: {
  readonly storageKey: string;
  readonly label: string;
  /** Shown at the right of the header, such as a reset button. */
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}) {
  const [expanded, setExpanded] = useStoredState(
    `difracta.inspector.${storageKey}`,
    true,
    isBoolean,
  );
  return (
    <section className="border-t" data-testid={`section-${storageKey}`}>
      <div className="flex h-7 items-center gap-1 pr-2 pl-2">
        <button
          type="button"
          aria-expanded={expanded}
          className="flex h-full min-w-0 flex-1 items-center gap-1 text-[0.625rem] font-medium tracking-wider text-muted-foreground/80 uppercase hover:text-foreground"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <ChevronDown className="size-3" />
          ) : (
            <ChevronRight className="size-3" />
          )}
          <span className="truncate">{label}</span>
        </button>
        {expanded && actions}
      </div>
      {expanded && (
        <div className="grid gap-1.5 px-3 pt-0.5 pb-3">{children}</div>
      )}
    </section>
  );
}
