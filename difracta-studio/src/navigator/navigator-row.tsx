import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** One selectable line in the navigator; the selected one carries the outline the inspector follows. */
export function NavigatorRow({
  icon: Icon,
  label,
  selected,
  depth = 1,
  onSelect,
  children,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly selected: boolean;
  /** Indentation level; 0 for the Installation root. */
  readonly depth?: number;
  readonly onSelect: () => void;
  /** Trailing content, such as a status dot. */
  readonly children?: ReactNode;
}) {
  return (
    <button
      type="button"
      data-selected={selected || undefined}
      className={cn(
        "flex h-6 w-full items-center gap-1.5 rounded-sm pr-2 text-left text-xs text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground focus-visible:outline-none",
        selected &&
          "bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-selection ring-inset",
      )}
      style={{ paddingLeft: `${String(0.5 + depth * 0.75)}rem` }}
      onClick={onSelect}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {children}
    </button>
  );
}
