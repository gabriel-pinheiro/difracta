import { accepted, rejected, type CommandOutcome } from "../command/command.ts";
import type { Document, TableName } from "../document/document.ts";
import {
  addPoints,
  midpoint,
  roundPoint,
  type Point,
} from "../document/geometry.ts";

/**
 * The point rules a Mask and an Output Mask share. Point edits replace the
 * whole `points` array, since patch paths address object keys, not array
 * positions; a polygon has at most sixteen points, so the patch stays small.
 */

/** A polygon entity with its points, whichever table it sits in. */
export interface PolygonEntity {
  readonly id: string;
  readonly points: readonly Point[];
}

/** How many points a polygon may have. */
export interface PointBounds {
  readonly min: number;
  readonly max: number;
}

/** The next point list, or the reason the edit is refused. */
export type PointsOrError = readonly Point[] | string;

/**
 * Applies `next` to the points of the entity `id` in `table`, as one patch
 * replacing the array; no patch when nothing moved, a refusal when the entity
 * is missing or `next` says why it cannot.
 */
export function withPoints(
  document: Document,
  table: Extract<TableName, "masks" | "outputMasks">,
  noun: string,
  id: string,
  next: (points: readonly Point[]) => PointsOrError,
): CommandOutcome {
  const entity: PolygonEntity | undefined = document[table][id];
  if (entity === undefined) return rejected(`${noun} “${id}” does not exist.`);
  const points = next(entity.points);
  if (typeof points === "string") return rejected(points);
  if (samePoints(points, entity.points)) return accepted([]);
  return accepted([
    { op: "set", path: [table, entity.id, "points"], value: points },
  ]);
}

function samePoints(a: readonly Point[], b: readonly Point[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (point, index) => point.x === b[index]?.x && point.y === b[index]?.y,
    )
  );
}

/** Why `index` names no point of `points`, or undefined when it does. */
export function missingPoint(
  noun: string,
  points: readonly Point[],
  index: number,
): string | undefined {
  return index < points.length
    ? undefined
    : `Point ${String(index)} does not exist; the ${noun} has ${String(points.length)} points.`;
}

/** The points with the one at `index` placed at `point`, rounded. */
export function pointSet(
  noun: string,
  points: readonly Point[],
  index: number,
  point: Point,
): PointsOrError {
  return (
    missingPoint(noun, points, index) ?? points.with(index, roundPoint(point))
  );
}

/** The points with the one at `index` shifted by `by`. */
export function pointNudge(
  noun: string,
  points: readonly Point[],
  index: number,
  by: Point,
): PointsOrError {
  const current = points[index];
  if (current === undefined) return missingPoint(noun, points, index) ?? "";
  return points.with(index, addPoints(current, by));
}

/** The points with one more, halfway along the edge that leaves point `after`. */
export function pointAdd(
  noun: string,
  bounds: PointBounds,
  points: readonly Point[],
  after: number,
): PointsOrError {
  const from = points[after];
  if (from === undefined) return missingPoint(noun, points, after) ?? "";
  if (points.length >= bounds.max)
    return `${article(noun)} has at most ${String(bounds.max)} points.`;
  const to = points[(after + 1) % points.length] ?? from;
  return points.toSpliced(after + 1, 0, midpoint(from, to));
}

/** The points without the one at `index`, never below the minimum. */
export function pointRemove(
  noun: string,
  bounds: PointBounds,
  points: readonly Point[],
  index: number,
): PointsOrError {
  const missing = missingPoint(noun, points, index);
  if (missing !== undefined) return missing;
  if (points.length <= bounds.min)
    return `${article(noun)} keeps at least ${String(bounds.min)} points.`;
  return points.toSpliced(index, 1);
}

/** "A Mask", "An Output Mask". */
function article(noun: string): string {
  return `${/^[aeiou]/i.test(noun) ? "An" : "A"} ${noun}`;
}
