import { z } from "zod";

import {
  accepted,
  defineCommand,
  rejected,
  type CommandOutcome,
} from "../command/command.ts";
import type { Document } from "../document/document.ts";
import {
  addPoints,
  CornerNameSchema,
  PointSchema,
  roundPoint,
  type CornerName,
  type Point,
} from "../document/geometry.ts";

/**
 * Corner edits act on the Surface's enabled mapping. Both commands share one
 * coalesce key, so a drag or a held arrow key becomes one undo step.
 */
function moveCorner(
  document: Document,
  surfaceId: string,
  corner: CornerName,
  next: (current: Point) => Point,
): CommandOutcome {
  const surface = document.surfaces[surfaceId];
  if (surface === undefined)
    return rejected(`Surface “${surfaceId}” does not exist.`);
  if (surface.output === null)
    return rejected(`Surface “${surface.name}” has no Output to calibrate.`);
  const mapping = surface.mappings[surface.output];
  if (mapping === undefined)
    return rejected(`Surface “${surface.name}” has no mapping for its Output.`);
  const current = mapping.corners[corner];
  const point = roundPoint(next(current));
  if (point.x === current.x && point.y === current.y) return accepted([]);
  return accepted([
    {
      op: "set",
      path: [
        "surfaces",
        surface.id,
        "mappings",
        surface.output,
        "corners",
        corner,
      ],
      value: point,
    },
  ]);
}

const coalesceKey = ({
  surfaceId,
  corner,
}: {
  surfaceId: string;
  corner: CornerName;
}) => `surface.corner:${surfaceId}:${corner}`;

export const surfaceCornerSet = defineCommand({
  name: "surface.corner.set",
  kind: "authoring",
  description:
    "Place one corner of a Surface's mapping, in normalized Projection Frame coordinates.",
  payload: z
    .object({
      surfaceId: z.string().min(1),
      corner: CornerNameSchema,
      point: PointSchema,
    })
    .strict(),
  label: () => "Move Surface corner",
  coalesceKey,
  apply: ({ document, payload }) =>
    moveCorner(
      document,
      payload.surfaceId,
      payload.corner,
      () => payload.point,
    ),
});

/**
 * Relative, so repeated nudges from a held key apply in full whatever order
 * their replies arrive in; an absolute set computed from a stale view would
 * lose or repeat steps.
 */
export const surfaceCornerNudge = defineCommand({
  name: "surface.corner.nudge",
  kind: "authoring",
  description:
    "Shift one corner of a Surface's mapping by a delta in normalized Projection Frame coordinates.",
  payload: z
    .object({
      surfaceId: z.string().min(1),
      corner: CornerNameSchema,
      by: PointSchema,
    })
    .strict(),
  label: () => "Move Surface corner",
  coalesceKey,
  apply: ({ document, payload }) =>
    moveCorner(document, payload.surfaceId, payload.corner, (current) =>
      addPoints(current, payload.by),
    ),
});
