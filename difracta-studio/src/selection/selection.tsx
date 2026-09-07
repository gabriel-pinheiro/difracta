import type React from "react";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { EntityKind } from "@/entities";

/** What the inspector shows: the Installation itself, or one entity by kind and id. */
export type Selection =
  | { readonly kind: "installation" }
  | { readonly kind: EntityKind; readonly id: string };

interface SelectionState {
  /** `undefined` when nothing is selected; the inspector then shows its empty state. */
  readonly selection: Selection | undefined;
  readonly select: (next: Selection | undefined) => void;
}

const Context = createContext<SelectionState | undefined>(undefined);

/** Studio-local, never sent to the runtime. Mount with a `key` per document so it resets. */
export function SelectionProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [selection, select] = useState<Selection | undefined>(undefined);
  const state = useMemo(() => ({ selection, select }), [selection]);
  return <Context.Provider value={state}>{children}</Context.Provider>;
}

export function useSelection(): SelectionState {
  const state = useContext(Context);
  if (state === undefined)
    throw new Error("useSelection needs a SelectionProvider.");
  return state;
}

export function isSelected(
  selection: Selection | undefined,
  kind: EntityKind,
  id: string,
): boolean {
  return selection?.kind === kind && selection.id === id;
}

/**
 * Click handler for a panel background: clears the selection unless the click
 * landed on something interactive (a row, a card, a button).
 */
export function deselectOnBackgroundClick(
  select: (next: undefined) => void,
): (event: React.MouseEvent<HTMLElement>) => void {
  return (event) => {
    const target = event.target as HTMLElement;
    // Dialogs are portaled but their React events still bubble here.
    if (
      target.closest("button, a, article, input, label, [role=dialog]") === null
    )
      select(undefined);
  };
}
