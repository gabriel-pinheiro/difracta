import { useCallback, useRef } from "react";

/**
 * Serializes sends of a value that changes faster than the runtime replies:
 * one send is in flight at a time, and only the newest value waiting gets
 * sent when it settles. A drag therefore never queues stale positions.
 */
export function useLatestWins<TValue>(
  send: (value: TValue) => Promise<unknown>,
): (value: TValue) => void {
  const state = useRef<{ busy: boolean; pending: TValue | undefined }>({
    busy: false,
    pending: undefined,
  });
  return useCallback(
    (value: TValue) => {
      const current = state.current;
      const go = (next: TValue): void => {
        current.busy = true;
        current.pending = undefined;
        void send(next).finally(() => {
          current.busy = false;
          if (current.pending !== undefined) go(current.pending);
        });
      };
      if (current.busy) current.pending = value;
      else go(value);
    },
    [send],
  );
}
