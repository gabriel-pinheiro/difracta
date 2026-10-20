import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import {
  siblingsOf,
  SlicePositionSchema,
  SliceRectSchema,
  SliceRotationSchema,
  SliceScaleSchema,
  tableEntries,
  type Slice,
} from "../document/document.ts";
import { uniqueName } from "../document/names.ts";
import { appendOrderKey } from "../document/order.ts";
import { newSlicePosition, newSliceRect } from "../document/slice-placement.ts";
import {
  outputSlices,
  projectionFrame,
  roundScale,
} from "../document/slices.ts";
import { generateId, id } from "../ids.ts";
import { outsideError, sliceEditPatches } from "./slice-edits.ts";

/**
 * A Slice of an Output's Display Frame, after the Output's other Slices,
 * inside the Display Frame. Without a rectangle it takes the largest empty
 * one (the whole frame for the first Slice), or the top-left quarter when
 * the frame is full; Slices may overlap there while being arranged. Without
 * a position it sits on stage where it sits in the Display Frame, or just
 * right of the stage when a placed Slice is already there; unturned and
 * unscaled until moved.
 */
export const sliceCreate = defineCommand({
  name: "slice.create",
  kind: "authoring",
  description:
    "Create a Slice: a rectangle of an Output's Display Frame (rect, in Display pixels) and where it sits on stage (position in Projection pixels, rotation, scale).",
  payload: z
    .object({
      id: z.string().min(1).optional(),
      outputId: z.string().min(1),
      name: z.string().trim().min(1).max(120),
      rect: SliceRectSchema.optional(),
      position: SlicePositionSchema.optional(),
      rotation: SliceRotationSchema.optional(),
      scale: SliceScaleSchema.optional(),
    })
    .strict(),
  label: ({ name }) => `Create Slice “${name}”`,
  apply({ document, payload }) {
    const sliceId =
      payload.id === undefined ? generateId("slice") : id("slice", payload.id);
    if (sliceId in document.slices)
      return rejected(`Slice “${sliceId}” already exists.`);
    const output = document.outputs[payload.outputId];
    if (output === undefined)
      return rejected(`Output “${payload.outputId}” does not exist.`);
    if (output.displaySize === null)
      return rejected(
        `Output “${output.name}” has no Display size; set one with output.update first.`,
      );
    const existing = outputSlices(document.slices, output.id);
    const rect = payload.rect ?? newSliceRect(output.displaySize, existing);
    const draft = { id: sliceId, outputId: output.id };
    const siblings = siblingsOf(
      "slices",
      document.slices,
      draft as unknown as Slice,
    );
    const slice: Slice = {
      ...draft,
      name: uniqueName(
        tableEntries(siblings).map((sibling) => sibling.name),
        payload.name,
      ),
      rect,
      position:
        payload.position ??
        newSlicePosition(rect, existing, projectionFrame(output, existing)),
      rotation: payload.rotation ?? 0,
      scale: roundScale(payload.scale ?? 1),
      order: appendOrderKey(siblings),
    };
    const outside = outsideError(document, slice);
    if (outside !== undefined) return rejected(outside);
    return accepted(
      sliceEditPatches(document, { outputId: output.id, set: [slice] }),
    );
  },
});
