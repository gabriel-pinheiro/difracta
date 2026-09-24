import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { EntityKind } from "@/entities";

/**
 * Rows that start open; every other row starts closed unless its section
 * passes its own default, as the active Scene's row does.
 */
const OPEN_BY_DEFAULT: Partial<Record<EntityKind, boolean>> = {
  output: true,
};

interface ExpansionState {
  /** The person's choice for the row once they toggled it, else `byDefault`, else the kind's default. */
  readonly isExpanded: (
    kind: EntityKind,
    id: string,
    byDefault?: boolean,
  ) => boolean;
  readonly setExpanded: (kind: EntityKind, id: string, next: boolean) => void;
}

const Context = createContext<ExpansionState | undefined>(undefined);

/**
 * Which navigator rows show their children. Kept in memory and reset with the
 * Installation: the ids are meaningless elsewhere, and per-browser storage
 * would fill with rows that no longer exist.
 */
export function ExpansionProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [overrides, setOverrides] = useState<ReadonlyMap<string, boolean>>(
    () => new Map(),
  );
  const isExpanded = useCallback(
    (kind: EntityKind, id: string, byDefault?: boolean): boolean =>
      overrides.get(`${kind}:${id}`) ??
      byDefault ??
      OPEN_BY_DEFAULT[kind] ??
      false,
    [overrides],
  );
  const setExpanded = useCallback(
    (kind: EntityKind, id: string, next: boolean): void => {
      setOverrides((previous) => {
        const key = `${kind}:${id}`;
        if (previous.get(key) === next) return previous;
        return new Map(previous).set(key, next);
      });
    },
    [],
  );
  const state = useMemo(
    () => ({ isExpanded, setExpanded }),
    [isExpanded, setExpanded],
  );
  return <Context.Provider value={state}>{children}</Context.Provider>;
}

export function useExpansion(): ExpansionState {
  const state = useContext(Context);
  if (state === undefined)
    throw new Error("useExpansion needs an ExpansionProvider.");
  return state;
}
