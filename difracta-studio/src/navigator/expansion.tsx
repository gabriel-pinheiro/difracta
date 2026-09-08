import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { EntityKind } from "@/entities";

/** Rows that start open; every other row starts closed. */
const OPEN_BY_DEFAULT: Partial<Record<EntityKind, boolean>> = {
  output: true,
};

interface ExpansionState {
  readonly isExpanded: (kind: EntityKind, id: string) => boolean;
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
    (kind: EntityKind, id: string): boolean =>
      overrides.get(`${kind}:${id}`) ?? OPEN_BY_DEFAULT[kind] ?? false,
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
