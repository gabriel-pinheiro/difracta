import { z } from "zod";

import {
  accepted,
  defineCommand,
  rejected,
  type CommandOutcome,
} from "../command/command.ts";
import { MASK_POINTS, type Document } from "../document/document.ts";
import {
  addPoints,
  midpoint,
  PointSchema,
  roundPoint,
  type Point,
} from "../document/geometry.ts";

/**
 * Point edits replace the whole `points` array, since patch paths address
 * object keys, not array positions; a Mask has at most sixteen points, so
 * the patch stays small. Set and nudge share one coalesce key per point.
 */
function withPoints(
  document: Document,
  maskId: string,
  next: (points: readonly Point[]) => readonly Point[] | string,
): CommandOutcome {
  const mask = document.masks[maskId];
  if (mask === undefined) return rejected(`Mask “${maskId}” does not exist.`);
  const points = next(mask.points);
  if (typeof points === "string") return rejected(points);
  if (
    points.length === mask.points.length &&
    points.every(
      (point, index) =>
        point.x === mask.points[index]?.x && point.y === mask.points[index]?.y,
    )
  )
    return accepted([]);
  return accepted([
    { op: "set", path: ["masks", mask.id, "points"], value: points },
  ]);
}

const indexOf = (
  points: readonly Point[],
  index: number,
): string | undefined =>
  index < points.length
    ? undefined
    : `Point ${String(index)} does not exist; the Mask has ${String(points.length)} points.`;

const Index = z.number().int().nonnegative();
const pointKey = ({ maskId, index }: { maskId: string; index: number }) =>
  `mask.point:${maskId}:${String(index)}`;

export const maskPointSet = defineCommand({
  name: "mask.point.set",
  kind: "authoring",
  description: "Place one point of a Mask, in Surface Space.",
  payload: z
    .object({ maskId: z.string().min(1), index: Index, point: PointSchema })
    .strict(),
  label: () => "Move Mask point",
  coalesceKey: pointKey,
  apply: ({ document, payload }) =>
    withPoints(document, payload.maskId, (points) => {
      const missing = indexOf(points, payload.index);
      if (missing !== undefined) return missing;
      return points.with(payload.index, roundPoint(payload.point));
    }),
});

/** Relative, so repeated nudges from a held key apply in full whatever order their replies arrive in. */
export const maskPointNudge = defineCommand({
  name: "mask.point.nudge",
  kind: "authoring",
  description: "Shift one point of a Mask by a delta in Surface Space.",
  payload: z
    .object({ maskId: z.string().min(1), index: Index, by: PointSchema })
    .strict(),
  label: () => "Move Mask point",
  coalesceKey: pointKey,
  apply: ({ document, payload }) =>
    withPoints(document, payload.maskId, (points) => {
      const current = points[payload.index];
      if (current === undefined) return indexOf(points, payload.index) ?? "";
      return points.with(payload.index, addPoints(current, payload.by));
    }),
});

/** Inserts a point halfway along the edge that leaves point `after`. */
export const maskPointAdd = defineCommand({
  name: "mask.point.add",
  kind: "authoring",
  description: "Add a point to a Mask after an existing one.",
  payload: z.object({ maskId: z.string().min(1), after: Index }).strict(),
  label: () => "Add Mask point",
  apply: ({ document, payload }) =>
    withPoints(document, payload.maskId, (points) => {
      const from = points[payload.after];
      if (from === undefined) return indexOf(points, payload.after) ?? "";
      if (points.length >= MASK_POINTS.max)
        return `A Mask has at most ${String(MASK_POINTS.max)} points.`;
      const to = points[(payload.after + 1) % points.length] ?? from;
      return points.toSpliced(payload.after + 1, 0, midpoint(from, to));
    }),
});

export const maskPointRemove = defineCommand({
  name: "mask.point.remove",
  kind: "authoring",
  description: "Remove a point from a Mask.",
  payload: z.object({ maskId: z.string().min(1), index: Index }).strict(),
  label: () => "Remove Mask point",
  apply: ({ document, payload }) =>
    withPoints(document, payload.maskId, (points) => {
      const missing = indexOf(points, payload.index);
      if (missing !== undefined) return missing;
      if (points.length <= MASK_POINTS.min)
        return `A Mask keeps at least ${String(MASK_POINTS.min)} points.`;
      return points.toSpliced(payload.index, 1);
    }),
});
