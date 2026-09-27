import type { Document } from "@difracta/core";

import type { EntityKind } from "@/entities";

/** One navigator row: the entity it stands for, by kind and id. */
export interface RowRef {
  readonly kind: EntityKind;
  readonly id: string;
}

/**
 * The row an entity's row is nested under, or `undefined` for a row at the
 * top of its section or an entity the document does not hold.
 */
export type RowParent = (document: Document, id: string) => RowRef | undefined;

/** The parent for a kind arranged in Groups of its own kind by `parentId`. */
export function groupParent(
  kind: EntityKind,
  table: (
    document: Document,
  ) => Readonly<Record<string, { readonly parentId: string | null }>>,
): RowParent {
  return (document, id) => {
    const parentId = table(document)[id]?.parentId ?? null;
    return parentId === null ? undefined : { kind, id: parentId };
  };
}

/**
 * The rows that must be open for `row` to show, nearest first: its parent,
 * that row's parent, and so on up to the top of the section. `parentOf`
 * gives each kind's own way up; a chain that loops ends where it would
 * repeat.
 */
export function ancestorRows(
  document: Document,
  row: RowRef,
  parentOf: (kind: EntityKind) => RowParent | undefined,
): readonly RowRef[] {
  const chain: RowRef[] = [];
  const seen = new Set([`${row.kind}:${row.id}`]);
  let current = row;
  for (;;) {
    const parent = parentOf(current.kind)?.(document, current.id);
    if (parent === undefined) return chain;
    const key = `${parent.kind}:${parent.id}`;
    if (seen.has(key)) return chain;
    seen.add(key);
    chain.push(parent);
    current = parent;
  }
}
