import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import type { ReactNode } from "react";

import { isBoolean, useStoredState } from "@/lib/storage";

import { NavigatorEmptyRow } from "./navigator-row";

/** Collapsible group of rows with a create button; the open state is remembered per browser. */
export function NavigatorSection({
  storageKey,
  label,
  empty,
  onCreate,
  children,
}: {
  readonly storageKey: string;
  readonly label: string;
  /** Shown in place of rows while the section has none. */
  readonly empty?: string | undefined;
  readonly onCreate: () => void;
  readonly children: ReactNode;
}) {
  const [expanded, setExpanded] = useStoredState(
    `difracta.navigator.${storageKey}`,
    true,
    isBoolean,
  );
  return (
    <section>
      <div className="flex h-6 items-center pr-1 pl-2">
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
        <button
          type="button"
          aria-label={`Add to ${label}`}
          title={`Add to ${label}`}
          className="grid size-5 place-items-center rounded-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          onClick={onCreate}
        >
          <Plus className="size-3" />
        </button>
      </div>
      {expanded &&
        (empty === undefined ? (
          <div className="grid gap-px">{children}</div>
        ) : (
          <NavigatorEmptyRow>{empty}</NavigatorEmptyRow>
        ))}
    </section>
  );
}
