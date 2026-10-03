/**
 * What a dragged row carries: its list's kind, its id and list, and its
 * own variant within the kind (a Layer's kind), which a list or a row
 * taking rows inside may limit; drop targets add an edge or `inside`.
 */
export interface DragData {
  readonly kind: string;
  readonly id: string;
  readonly listId: string;
  readonly variant?: string | undefined;
}

export function dragData(data: Record<string, unknown>): DragData | undefined {
  const { kind, id, listId, variant } = data;
  return typeof kind === "string" &&
    typeof id === "string" &&
    typeof listId === "string"
    ? { kind, id, listId, variant: asVariant(variant) }
    : undefined;
}

const asVariant = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

/** Whether a row's variant is among the ones taken; no list takes every one. */
export function takesVariant(
  variants: readonly string[] | undefined,
  variant: unknown,
): boolean {
  return variants === undefined || variants.includes(asVariant(variant) ?? "");
}
