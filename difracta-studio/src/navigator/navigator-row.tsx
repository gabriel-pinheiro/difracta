import { ChevronDown, ChevronRight, Plus, type LucideIcon } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** One choice in a row's "+" menu, for rows that can hold several kinds of children. */
export interface CreateItem {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly onSelect: () => void;
}

/** Left edge of a row's content at `depth`, leaving room for the chevron slot on nested rows. */
function indent(depth: number): string {
  return `${String(0.5 + Math.max(depth - 1, 0) * 0.75)}rem`;
}

/**
 * One selectable line in the navigator; the selected one carries the outline
 * the inspector follows. Rows below the root reserve a slot for a chevron so
 * labels align within a level whether or not the row can open; the chevron
 * toggles without selecting, the label selects without toggling, and Left and
 * Right on a focused row close and open it.
 */
export function NavigatorRow({
  icon: Icon,
  label,
  selected,
  depth = 1,
  expanded,
  onToggle,
  onSelect,
  onCreate,
  createItems,
  actions,
  dimmed = false,
  children,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly selected: boolean;
  /** Indentation level; 0 for the Installation root. */
  readonly depth?: number;
  /** Whether the row's children show; only meaningful with `onToggle`. */
  readonly expanded?: boolean | undefined;
  /** Makes the row collapsible: shows a chevron that flips `expanded`. */
  readonly onToggle?: ((next: boolean) => void) | undefined;
  readonly onSelect: () => void;
  /** Adds a child; shows a "+" at the row's end, as section headers have. */
  readonly onCreate?: () => void;
  /** Several kinds of children: the "+" opens a menu of these instead. */
  readonly createItems?: readonly CreateItem[] | undefined;
  /** Buttons after the label, outside the selecting button: an eye, a play. */
  readonly actions?: ReactNode;
  /** Shown faded: disabled by itself or by a Group above it. */
  readonly dimmed?: boolean;
  /** Trailing content inside the selecting button, such as a status dot. */
  readonly children?: ReactNode;
}) {
  const open = expanded === true;
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (onToggle === undefined) return;
    if (event.key === "ArrowRight" && !open) onToggle(true);
    else if (event.key === "ArrowLeft" && open) onToggle(false);
    else return;
    event.preventDefault();
  }
  return (
    <div
      data-selected={selected || undefined}
      className={cn(
        "flex h-6 w-full items-center gap-1 rounded-sm text-xs text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
        selected &&
          "bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-selection ring-inset",
        dimmed && "opacity-55",
      )}
      style={{ paddingLeft: indent(depth) }}
    >
      {depth > 0 &&
        (onToggle === undefined ? (
          <span className="size-3 shrink-0" />
        ) : (
          <button
            type="button"
            aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
            aria-expanded={open}
            className="grid size-3 shrink-0 place-items-center rounded-sm hover:text-foreground"
            onClick={() => onToggle(!open)}
          >
            {open ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
          </button>
        ))}
      <button
        type="button"
        className={cn(
          "flex h-full min-w-0 flex-1 items-center gap-1.5 text-left focus-visible:outline-none",
          onCreate === undefined &&
            createItems === undefined &&
            actions === undefined
            ? "pr-2"
            : "pr-1",
        )}
        onClick={onSelect}
        onKeyDown={onKeyDown}
      >
        <Icon className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {children}
      </button>
      {actions}
      {actions !== undefined &&
        onCreate === undefined &&
        createItems === undefined && (
          // Keeps the actions in one column with rows that have a "+".
          <span className="mr-1 size-5 shrink-0" />
        )}
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
  );
}

const createButtonClass =
  "mr-1 grid size-5 shrink-0 place-items-center rounded-sm hover:bg-sidebar-accent hover:text-foreground";

/** A small button for a row's `actions` slot. */
export function RowAction({
  label,
  active = false,
  onClick,
  children,
}: {
  readonly label: string;
  /** Kept visible instead of only on hover, such as a closed eye. */
  readonly active?: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-sm hover:bg-sidebar-accent hover:text-foreground",
        !active && "text-muted-foreground/70",
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** A dim line where children would be, aligned with a row's icon at `depth`. */
export function NavigatorEmptyRow({
  depth = 1,
  children,
}: {
  readonly depth?: number;
  readonly children: ReactNode;
}) {
  return (
    <p
      className="h-6 truncate text-xs/6 text-muted-foreground/60 italic"
      style={{ paddingLeft: `calc(${indent(depth)} + 1rem)` }}
    >
      {children}
    </p>
  );
}
