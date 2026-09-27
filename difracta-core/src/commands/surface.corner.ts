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
import { pickOutput } from "../document/mappings.ts";

/**
 * Corner edits act on the Surface's mapping for one Output: the one named,
 * or the only one the Surface is on. Both commands share one coalesce key
 * per Output, so a drag or a held arrow key becomes one undo step.
 */
function moveCorner(
  document: Document,
  { surfaceId, corner, output }: CornerTarget,
  next: (current: Point) => Point,
): CommandOutcome {
  const surface = document.surfaces[surfaceId];
  if (surface === undefined)
    return rejected(`Surface “${surfaceId}” does not exist.`);
  const picked = pickOutput(document, surface, output);
  if (!picked.ok) return rejected(picked.error);
  const mapping = surface.mappings[picked.outputId];
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
        picked.outputId,
        "corners",
        corner,
      ],
      value: point,
    },
  ]);
}

interface CornerTarget {
  readonly surfaceId: string;
  readonly corner: CornerName;
  readonly output?: string | undefined;
}

const target = {
  surfaceId: z.string().min(1),
  corner: CornerNameSchema,
  /** The Output whose mapping moves; needed once the Surface is on several. */
  output: z.string().min(1).optional(),
};

const coalesceKey = ({ surfaceId, corner, output }: CornerTarget) =>
  `surface.corner:${surfaceId}:${output ?? ""}:${corner}`;

export const surfaceCornerSet = defineCommand({
  name: "surface.corner.set",
  kind: "authoring",
  description:
    "Place one corner of a Surface's mapping, in normalized Projection Frame coordinates.",
  payload: z.object({ ...target, point: PointSchema }).strict(),
  label: () => "Move Surface corner",
  coalesceKey,
  apply: ({ document, payload }) =>
    moveCorner(document, payload, () => payload.point),
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
  payload: z.object({ ...target, by: PointSchema }).strict(),
  label: () => "Move Surface corner",
  coalesceKey,
  apply: ({ document, payload }) =>
    moveCorner(document, payload, (current) => addPoints(current, payload.by)),
});
