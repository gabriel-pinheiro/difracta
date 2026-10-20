import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import {
  SlicePositionSchema,
  SliceRectSchema,
  SliceRotationSchema,
  SliceScaleSchema,
  type Slice,
} from "../document/document.ts";
import { roundScale } from "../document/slices.ts";
import { outsideError, sliceEditPatches } from "./slice-edits.ts";

const FIELDS = ["rect", "position", "rotation", "scale"] as const;

/**
 * Any of a Slice's Display rectangle and placement at once. A drag sends
 * the same fields again and again, which coalesce into one undo step per
 * Slice and set of fields.
 */
export const sliceUpdate = defineCommand({
  name: "slice.update",
  kind: "authoring",
  description:
    "Change a Slice's rect (Display pixels), position (Projection pixels), rotation (0, 90, 180, 270 clockwise) or scale.",
  payload: z
    .object({
      sliceId: z.string().min(1),
      rect: SliceRectSchema.optional(),
      position: SlicePositionSchema.optional(),
      rotation: SliceRotationSchema.optional(),
      scale: SliceScaleSchema.optional(),
    })
    .strict(),
  label: () => "Change Slice",
  coalesceKey: (payload) =>
    `slice.update:${payload.sliceId}:${FIELDS.filter(
      (field) => payload[field] !== undefined,
    ).join(",")}`,
  apply({ document, payload }) {
    const slice = document.slices[payload.sliceId];
    if (slice === undefined)
      return rejected(`Slice “${payload.sliceId}” does not exist.`);
    const next: Slice = {
      ...slice,
      rect: payload.rect ?? slice.rect,
      position: payload.position ?? slice.position,
      rotation: payload.rotation ?? slice.rotation,
      scale:
        payload.scale === undefined ? slice.scale : roundScale(payload.scale),
    };
    return applySliceChange(document, slice, next);
  },
});

/**
 * Writes a changed Slice, refusing a rectangle that would leave the Display
 * Frame; nothing when unchanged. Display overlap is allowed.
 */
export function applySliceChange(
  document: Parameters<typeof sliceEditPatches>[0],
  slice: Slice,
  next: Slice,
) {
  if (JSON.stringify(next) === JSON.stringify(slice)) return accepted([]);
  // A Slice left past the edge by a smaller Display size may be edited
  // freely until it is back inside; one inside may not leave.
  if (
    JSON.stringify(next.rect) !== JSON.stringify(slice.rect) &&
    outsideError(document, slice) === undefined
  ) {
    const outside = outsideError(document, next);
    if (outside !== undefined) return rejected(outside);
  }
  return accepted(
    sliceEditPatches(document, { outputId: slice.outputId, set: [next] }),
  );
}
