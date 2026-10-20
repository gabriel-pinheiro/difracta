import { z } from "zod";

import { defineCommand, rejected } from "../command/command.ts";
import { applySliceChange } from "./slice.update.ts";

/**
 * Shifts a Slice's Display rectangle or its placement by whole pixels; the
 * rectangle stops at the Display Frame's edges.
 * Relative, so the nudges of a held arrow key apply in full whatever order
 * their replies arrive in.
 */
export const sliceNudge = defineCommand({
  name: "slice.nudge",
  kind: "authoring",
  description:
    "Shift a Slice's rect (of: rect, Display pixels) or its placement (of: position, Projection pixels) by dx, dy.",
  payload: z
    .object({
      sliceId: z.string().min(1),
      of: z.enum(["rect", "position"]),
      dx: z.number().int(),
      dy: z.number().int(),
    })
    .strict(),
  label: () => "Move Slice",
  coalesceKey: ({ sliceId, of }) => `slice.nudge:${sliceId}:${of}`,
  apply({ document, payload }) {
    const slice = document.slices[payload.sliceId];
    if (slice === undefined)
      return rejected(`Slice “${payload.sliceId}” does not exist.`);
    if (payload.of === "rect") {
      // Stops at the Display Frame's edges, so a held arrow key never errors.
      const size = document.outputs[slice.outputId]?.displaySize;
      const maxX = Math.max(0, (size?.width ?? Infinity) - slice.rect.width);
      const maxY = Math.max(0, (size?.height ?? Infinity) - slice.rect.height);
      const x = clamp(
        slice.rect.x + payload.dx,
        Math.min(0, slice.rect.x),
        Math.max(maxX, slice.rect.x),
      );
      const y = clamp(
        slice.rect.y + payload.dy,
        Math.min(0, slice.rect.y),
        Math.max(maxY, slice.rect.y),
      );
      return applySliceChange(document, slice, {
        ...slice,
        rect: { ...slice.rect, x, y },
      });
    }
    return applySliceChange(document, slice, {
      ...slice,
      position: {
        x: slice.position.x + payload.dx,
        y: slice.position.y + payload.dy,
      },
    });
  },
});

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
