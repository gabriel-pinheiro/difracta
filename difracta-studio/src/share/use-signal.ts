import type { ReadonlySignal } from "@difracta/client";
import { useCallback, useSyncExternalStore } from "react";

/** The signal's value, read again whenever it changes. */
export function useSignal<TValue>(signal: ReadonlySignal<TValue>): TValue {
  const subscribe = useCallback(
    (changed: () => void) => signal.subscribe(changed),
    [signal],
  );
  return useSyncExternalStore(subscribe, () => signal.get());
}
