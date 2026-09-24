import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { EntityKind } from "@/entities";
import { isBoolean, useStoredState } from "@/lib/storage";
import { useSelection } from "@/selection/selection";

import { NavigatorEmptyRow, type CreateItem } from "./navigator-row";
import { SectionWarning } from "./navigator-warning";

/**
 * Collapsible group of rows with a create button; the open state is
 * remembered per browser, starting from `defaultExpanded`. A collapsed
 * section still shows while the selection is an entity of a kind it `holds`,
 * so a created or chip-selected entity is never hidden; that reveal is not
 * remembered, and collapsing by hand hides it again until the selection
 * moves. While collapsed, the header carries an amber mark for the rows
 * inside that warn, counted by the section from its rows' own checks.
 */
export function NavigatorSection({
  storageKey,
  label,
  holds,
  defaultExpanded = true,
  empty,
  warnings = 0,
  onCreate,
  createItems,
  children,
}: {
  readonly storageKey: string;
  readonly label: string;
  /** Entity kinds whose rows live in this section, its own and nested ones. */
  readonly holds: readonly EntityKind[];
  readonly defaultExpanded?: boolean | undefined;
  /** Shown in place of rows while the section has none. */
  readonly empty?: string | undefined;
  /** How many rows inside warn; shown on the header only while collapsed. */
  readonly warnings?: number | undefined;
  readonly onCreate?: (() => void) | undefined;
  /** Several kinds of entries: the "+" opens a menu of these instead. */
  readonly createItems?: readonly CreateItem[] | undefined;
  readonly children: ReactNode;
}) {
  const [stored, setStored] = useStoredState(
    `difracta.navigator.${storageKey}`,
    defaultExpanded,
    isBoolean,
  );
  const revealing = useRevealFor(holds);
  const expanded = stored || revealing.active;
  const setExpanded = (next: boolean): void => {
    setStored(next);
    if (!next) revealing.dismiss();
  };
  return (
    <section>
      <div className="flex h-6 items-center pr-1 pl-2">
        <button
          type="button"
          aria-expanded={expanded}
          data-navigator-section={storageKey}
          className="flex h-full min-w-0 flex-1 items-center gap-1 text-[0.625rem] font-medium tracking-wider text-muted-foreground/80 uppercase hover:text-foreground"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <ChevronDown className="size-3" />
          ) : (
            <ChevronRight className="size-3" />
          )}
          <span className="truncate">{label}</span>
          {!expanded && warnings > 0 && <SectionWarning count={warnings} />}
        </button>
        {onCreate !== undefined && (
          <button
            type="button"
            aria-label={`Add to ${label}`}
            title={`Add to ${label}`}
            className={createButtonClass}
            onClick={onCreate}
          >
            <Plus className="size-3" />
          </button>
        )}
        {createItems !== undefined && (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Add to ${label}`}
              title={`Add to ${label}`}
              className={createButtonClass}
            >
              <Plus className="size-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {createItems.map((item) => (
                <DropdownMenuItem key={item.label} onClick={item.onSelect}>
                  <item.icon /> {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {expanded &&
        (empty === undefined ? (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-px">
            {children}
          </div>
        ) : (
          <NavigatorEmptyRow>{empty}</NavigatorEmptyRow>
        ))}
    </section>
  );
}

/**
 * Whether the selection is an entity of a kind in `holds` that has not been
 * dismissed by collapsing the section; a new selection clears the dismissal.
 */
function useRevealFor(holds: readonly EntityKind[]): {
  readonly active: boolean;
  readonly dismiss: () => void;
} {
  const { selection } = useSelection();
  const key =
    selection !== undefined &&
    selection.kind !== "installation" &&
    holds.includes(selection.kind)
      ? `${selection.kind}:${selection.id}`
      : undefined;
  const [dismissed, setDismissed] = useState<string | undefined>(undefined);
  const [seen, setSeen] = useState(key);
  if (seen !== key) {
    setSeen(key);
    setDismissed(undefined);
  }
  return {
    active: key !== undefined && key !== dismissed,
    dismiss: () => setDismissed(key),
  };
}

const createButtonClass =
  "grid size-5 place-items-center rounded-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground";
