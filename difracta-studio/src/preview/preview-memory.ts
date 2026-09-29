/** Values remembered by id, oldest first. */
export type Remembered<TValue> = Readonly<Record<string, TValue>>;

/**
 * `record` with `value` under `id` as its newest entry, and without the
 * oldest ones beyond `limit`.
 */
export function remember<TValue>(
  record: Remembered<TValue>,
  id: string,
  value: TValue,
  limit: number,
): Remembered<TValue> {
  const entries = Object.entries(record).filter(([key]) => key !== id);
  entries.push([id, value]);
  return Object.fromEntries(entries.slice(-Math.max(1, limit)));
}

/** Accepts a stored record whose values all pass `accept`. */
export function isRemembered<TValue>(
  accept: (candidate: unknown) => candidate is TValue,
): (candidate: unknown) => candidate is Remembered<TValue> {
  return (candidate): candidate is Remembered<TValue> =>
    typeof candidate === "object" &&
    candidate !== null &&
    !Array.isArray(candidate) &&
    Object.values(candidate).every(accept);
}
