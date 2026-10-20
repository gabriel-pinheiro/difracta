import type { SlicePosition, SliceRect } from "@difracta/core";

/** What one drag in the Slice editor changes: a rectangle, a placement or a scale. */
export type SliceDragChange =
  | { readonly rect: SliceRect }
  | { readonly position: SlicePosition }
  | { readonly scale: number };

/**
 * The `slice.update` payload for one step of a drag. Each step of one drag
 * sends the same single field, so the runtime coalesces the whole drag
 * into one undo step per Slice.
 */
export function sliceDragPayload(
  sliceId: string,
  change: SliceDragChange,
): { readonly sliceId: string } & SliceDragChange {
  return { sliceId, ...change };
}
