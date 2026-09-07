import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

/**
 * Entities that the user can arrange carry an `order` key: a short string
 * that sorts lexicographically (fractional indexing). Moving one entity sets
 * only its own key to a value between its new neighbours, so a move is one
 * patch and one changed line in the file. Ties, which only legacy data can
 * produce, sort by id and are renumbered by the next move among them.
 */
export interface Ordered {
  readonly id: string;
  readonly order: string;
}

/** First key handed to entities that never had one. */
export const DEFAULT_ORDER_KEY = generateKeyBetween(null, null);

export function compareOrdered(first: Ordered, second: Ordered): number {
  if (first.order !== second.order) return first.order < second.order ? -1 : 1;
  return first.id < second.id ? -1 : first.id === second.id ? 0 : 1;
}

/** Table entries in display order. */
export function orderedEntries<TEntity extends Ordered>(
  table: Readonly<Record<string, TEntity>>,
): readonly TEntity[] {
  return Object.values(table).sort(compareOrdered);
}

/** A key that sorts after everything in `table`. */
export function appendOrderKey(
  table: Readonly<Record<string, Ordered>>,
): string {
  const last = orderedEntries(table).at(-1);
  return generateKeyBetween(last?.order ?? null, null);
}

/**
 * Keys for placing `moving` right after `after` (null for first) among
 * `siblings`, which excludes `moving` and is already ordered. Returns the new
 * key of every entity whose key changes: usually just `moving`; every
 * sibling too when the neighbours' keys leave no room between them.
 */
export function orderKeysForMove(
  siblings: readonly Ordered[],
  moving: Ordered,
  after: string | null,
): ReadonlyMap<string, string> {
  const index =
    after === null ? -1 : siblings.findIndex((entity) => entity.id === after);
  const previous = index === -1 ? undefined : siblings[index];
  const next = siblings[index + 1];
  const changes = new Map<string, string>();
  try {
    const key = generateKeyBetween(
      previous?.order ?? null,
      next?.order ?? null,
    );
    if (key !== moving.order) changes.set(moving.id, key);
    return changes;
  } catch {
    // Neighbours tie or carry keys from elsewhere: renumber the whole list.
    const arranged = [
      ...siblings.slice(0, index + 1),
      moving,
      ...siblings.slice(index + 1),
    ];
    const keys = generateNKeysBetween(null, null, arranged.length);
    arranged.forEach((entity, position) => {
      const key = keys[position];
      if (key !== undefined && key !== entity.order)
        changes.set(entity.id, key);
    });
    return changes;
  }
}
