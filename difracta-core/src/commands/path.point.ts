import { z } from "zod";

import {
  accepted,
  defineCommand,
  rejected,
  type CommandOutcome,
} from "../command/command.ts";
import { PATH_POINTS, type Document } from "../document/document.ts";
import {
  addPoints,
  midpoint,
  PointSchema,
  roundPoint,
  type Point,
} from "../document/geometry.ts";

/**
 * Point edits replace the whole `points` array, since patch paths address
 * object keys, not array positions; a Path has at most sixteen points, so
 * the patch stays small. Set and nudge share one coalesce key per point.
 */
function withPoints(
  document: Document,
  pathId: string,
  next: (points: readonly Point[]) => readonly Point[] | string,
): CommandOutcome {
  const path = document.paths[pathId];
  if (path === undefined) return rejected(`Path “${pathId}” does not exist.`);
  const points = next(path.points);
  if (typeof points === "string") return rejected(points);
  if (
    points.length === path.points.length &&
    points.every(
      (point, index) =>
        point.x === path.points[index]?.x && point.y === path.points[index]?.y,
    )
  )
    return accepted([]);
  return accepted([
    { op: "set", path: ["paths", path.id, "points"], value: points },
  ]);
}

const indexOf = (
  points: readonly Point[],
  index: number,
): string | undefined =>
  index < points.length
    ? undefined
    : `Point ${String(index)} does not exist; the Path has ${String(points.length)} points.`;

const Index = z.number().int().nonnegative();
const pointKey = ({ pathId, index }: { pathId: string; index: number }) =>
  `path.point:${pathId}:${String(index)}`;

export const pathPointSet = defineCommand({
  name: "path.point.set",
  kind: "authoring",
  description: "Place one point of a Path, in Surface Space.",
  payload: z
    .object({ pathId: z.string().min(1), index: Index, point: PointSchema })
    .strict(),
  label: () => "Move Path point",
  coalesceKey: pointKey,
  apply: ({ document, payload }) =>
    withPoints(document, payload.pathId, (points) => {
      const missing = indexOf(points, payload.index);
      if (missing !== undefined) return missing;
      return points.with(payload.index, roundPoint(payload.point));
    }),
});

/** Relative, so repeated nudges from a held key apply in full whatever order their replies arrive in. */
export const pathPointNudge = defineCommand({
  name: "path.point.nudge",
  kind: "authoring",
  description: "Shift one point of a Path by a delta in Surface Space.",
  payload: z
    .object({ pathId: z.string().min(1), index: Index, by: PointSchema })
    .strict(),
  label: () => "Move Path point",
  coalesceKey: pointKey,
  apply: ({ document, payload }) =>
    withPoints(document, payload.pathId, (points) => {
      const current = points[payload.index];
      if (current === undefined) return indexOf(points, payload.index) ?? "";
      return points.with(payload.index, addPoints(current, payload.by));
    }),
});

/**
 * Inserts a point halfway along the edge that leaves point `after`; after
 * the last point of an open Path, where no edge leaves, the new point
 * continues the line by the last segment's length.
 */
export const pathPointAdd = defineCommand({
  name: "path.point.add",
  kind: "authoring",
  description: "Add a point to a Path after an existing one.",
  payload: z.object({ pathId: z.string().min(1), after: Index }).strict(),
  label: () => "Add Path point",
  apply: ({ document, payload }) =>
    withPoints(document, payload.pathId, (points) => {
      const from = points[payload.after];
      if (from === undefined) return indexOf(points, payload.after) ?? "";
      if (points.length >= PATH_POINTS.max)
        return `A Path has at most ${String(PATH_POINTS.max)} points.`;
      const last = payload.after === points.length - 1;
      const path = document.paths[payload.pathId];
      const to = points[(payload.after + 1) % points.length] ?? from;
      if (last && path?.closed === false) {
        const previous = points[payload.after - 1] ?? from;
        return points.toSpliced(payload.after + 1, 0, extend(previous, from));
      }
      return points.toSpliced(payload.after + 1, 0, midpoint(from, to));
    }),
});

/** `from` carried past `to` by the same distance, kept inside Surface Space. */
function extend(from: Point, to: Point): Point {
  return roundPoint({
    x: Math.min(1, Math.max(0, to.x + (to.x - from.x))),
    y: Math.min(1, Math.max(0, to.y + (to.y - from.y))),
  });
}

export const pathPointRemove = defineCommand({
  name: "path.point.remove",
  kind: "authoring",
  description: "Remove a point from a Path.",
  payload: z.object({ pathId: z.string().min(1), index: Index }).strict(),
  label: () => "Remove Path point",
  apply: ({ document, payload }) =>
    withPoints(document, payload.pathId, (points) => {
      const missing = indexOf(points, payload.index);
      if (missing !== undefined) return missing;
      if (points.length <= PATH_POINTS.min)
        return `A Path keeps at least ${String(PATH_POINTS.min)} points.`;
      return points.toSpliced(payload.index, 1);
    }),
});
