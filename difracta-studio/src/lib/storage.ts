import { useCallback, useState } from "react";

/** localStorage that may be missing or throwing (private windows); falls back silently. */
export function readStored<TValue>(
  key: string,
  fallback: TValue,
  accept: (candidate: unknown) => candidate is TValue,
): TValue {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return accept(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function writeStored(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is a convenience; losing it changes nothing.
  }
}

/** Component state mirrored to localStorage under `key`. */
export function useStoredState<TValue>(
  key: string,
  fallback: TValue,
  accept: (candidate: unknown) => candidate is TValue,
): readonly [TValue, (next: TValue) => void] {
  const [value, setValue] = useState(() => readStored(key, fallback, accept));
  const update = useCallback(
    (next: TValue) => {
      setValue(next);
      writeStored(key, next);
    },
    [key],
  );
  return [value, update];
}

export const isBoolean = (candidate: unknown): candidate is boolean =>
  typeof candidate === "boolean";
