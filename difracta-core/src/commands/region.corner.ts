import { z } from "zod";

import {
  accepted,
  defineCommand,
  rejected,
  type CommandOutcome,
} from "../command/command.ts";
import { RegionCornerSchema, type Document } from "../document/document.ts";
import { addPoints, PointSchema, type Point } from "../document/geometry.ts";
import { withRegionCorner } from "../document/targets.ts";

/**
 * Corner edits replace the whole `bounds`, keeping the rectangle inside
 * Surface Space and its sides above the minimum (`withRegionCorner`). Set
 * and nudge share one coalesce key per corner, so a drag or a held arrow
 * key becomes one undo step.
 */
function moveCorner(
  document: Document,
  regionId: string,
  corner: "topLeft" | "bottomRight",
  next: (current: Point) => Point,
): CommandOutcome {
  const region = document.regions[regionId];
  if (region === undefined)
    return rejected(`Region “${regionId}” does not exist.`);
  const bounds = withRegionCorner(
    region.bounds,
    corner,
    next(region.bounds[corner]),
  );
  const moved = bounds[corner];
  const current = region.bounds[corner];
  if (moved.x === current.x && moved.y === current.y) return accepted([]);
  return accepted([
    { op: "set", path: ["regions", region.id, "bounds"], value: bounds },
  ]);
}

const coalesceKey = ({
  regionId,
  corner,
}: {
  regionId: string;
  corner: string;
}) => `region.corner:${regionId}:${corner}`;

export const regionCornerSet = defineCommand({
  name: "region.corner.set",
  kind: "authoring",
  description: "Place one corner of a Region, in Surface Space.",
  payload: z
    .object({
      regionId: z.string().min(1),
      corner: RegionCornerSchema,
      point: PointSchema,
    })
    .strict(),
  label: () => "Move Region corner",
  coalesceKey,
  apply: ({ document, payload }) =>
    moveCorner(document, payload.regionId, payload.corner, () => payload.point),
});

/** Relative, so repeated nudges from a held key apply in full whatever order their replies arrive in. */
export const regionCornerNudge = defineCommand({
  name: "region.corner.nudge",
  kind: "authoring",
  description: "Shift one corner of a Region by a delta in Surface Space.",
  payload: z
    .object({
      regionId: z.string().min(1),
      corner: RegionCornerSchema,
      by: PointSchema,
    })
    .strict(),
  label: () => "Move Region corner",
  coalesceKey,
  apply: ({ document, payload }) =>
    moveCorner(document, payload.regionId, payload.corner, (current) =>
      addPoints(current, payload.by),
    ),
});
