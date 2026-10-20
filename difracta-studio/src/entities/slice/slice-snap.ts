import {
  placedRect,
  type PixelRect,
  type Slice,
  type SliceRect,
} from "@difracta/core";

/**
 * Snapping for the Slice editor: a dragged rectangle's edges land on the
 * frame's edges and on other Slices' edges when within `threshold` pixels,
 * and always on whole pixels.
 */

/** Edges a dragged edge may snap to on one axis. */
export interface SnapTargets {
  readonly x: readonly number[];
  readonly y: readonly number[];
}

/** The nearest target within `threshold` of `value`, if any. */
export function nearest(
  value: number,
  targets: readonly number[],
  threshold: number,
): number | undefined {
  let best: number | undefined;
  for (const target of targets) {
    const distance = Math.abs(target - value);
    if (
      distance <= threshold &&
      (best === undefined || distance < Math.abs(best - value))
    )
      best = target;
  }
  return best;
}

/**
 * Where a span from `start` of length `length` goes so that either end
 * meets a target: the start shifted by the smaller snap, or rounded.
 */
function snapSpan(
  start: number,
  length: number,
  targets: readonly number[],
  threshold: number,
): number {
  const atStart = nearest(start, targets, threshold);
  const atEnd = nearest(start + length, targets, threshold);
  const shiftStart = atStart === undefined ? Infinity : atStart - start;
  const shiftEnd = atEnd === undefined ? Infinity : atEnd - (start + length);
  const shift =
    Math.abs(shiftStart) <= Math.abs(shiftEnd) ? shiftStart : shiftEnd;
  return Math.round(Number.isFinite(shift) ? start + shift : start);
}

/** Edges of the Display Frame and of the other Slices' Display rectangles. */
export function displayTargets(
  size: { readonly width: number; readonly height: number },
  others: readonly Slice[],
): SnapTargets {
  return {
    x: [
      0,
      size.width,
      ...others.flatMap((s) => [s.rect.x, s.rect.x + s.rect.width]),
    ],
    y: [
      0,
      size.height,
      ...others.flatMap((s) => [s.rect.y, s.rect.y + s.rect.height]),
    ],
  };
}

/** Edges of the other Slices as placed in the Projection layout. */
export function stageTargets(others: readonly Slice[]): SnapTargets {
  const rects = others.map(placedRect);
  return {
    x: rects.flatMap((r) => [r.x, r.x + r.width]),
    y: rects.flatMap((r) => [r.y, r.y + r.height]),
  };
}

/** A Display Frame's size, which Display rectangles are kept inside. */
export interface Bounds {
  readonly width: number;
  readonly height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * A rectangle moved to `x`, `y` (top-left, pixels), snapped; kept inside
 * `bounds` when given, stopping at whichever edge it meets. A rectangle
 * wider or taller than the bounds stays at their start.
 */
export function snapMove(
  rect: PixelRect,
  x: number,
  y: number,
  targets: SnapTargets,
  threshold: number,
  bounds?: Bounds,
): { readonly x: number; readonly y: number } {
  const snappedX = snapSpan(x, rect.width, targets.x, threshold);
  const snappedY = snapSpan(y, rect.height, targets.y, threshold);
  if (bounds === undefined) return { x: snappedX, y: snappedY };
  return {
    x: clamp(snappedX, 0, Math.max(0, bounds.width - rect.width)),
    y: clamp(snappedY, 0, Math.max(0, bounds.height - rect.height)),
  };
}

/** What a resize handle drags: a corner, both its edges, or one side. */
export type ResizeHandle =
  | "topLeft"
  | "topRight"
  | "bottomRight"
  | "bottomLeft"
  | "top"
  | "right"
  | "bottom"
  | "left";

export const CORNER_HANDLES = [
  "topLeft",
  "topRight",
  "bottomRight",
  "bottomLeft",
] as const satisfies readonly ResizeHandle[];
export const EDGE_HANDLES = [
  "top",
  "right",
  "bottom",
  "left",
] as const satisfies readonly ResizeHandle[];

/** The edges a handle moves. */
function movedEdges(handle: ResizeHandle) {
  const lower = handle.toLowerCase();
  return {
    left: lower.includes("left"),
    right: lower.includes("right"),
    top: lower.startsWith("top"),
    bottom: lower.startsWith("bottom"),
  };
}

/**
 * A Display rectangle with a corner or a side dragged to `point`, snapped
 * per edge, whole pixels, at least one pixel wide and tall, its dragged
 * edges stopping at the edges of `bounds`.
 */
export function snapResize(
  rect: SliceRect,
  handle: ResizeHandle,
  point: { readonly x: number; readonly y: number },
  targets: SnapTargets,
  threshold: number,
  bounds: Bounds,
): SliceRect {
  const snap = (value: number, axis: readonly number[]): number =>
    Math.round(nearest(value, axis, threshold) ?? value);
  const moves = movedEdges(handle);
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.width;
  let bottom = rect.y + rect.height;
  if (moves.left) left = clamp(snap(point.x, targets.x), 0, right - 1);
  if (moves.right)
    right = clamp(
      snap(point.x, targets.x),
      left + 1,
      Math.max(left + 1, bounds.width),
    );
  if (moves.top) top = clamp(snap(point.y, targets.y), 0, bottom - 1);
  if (moves.bottom)
    bottom = clamp(
      snap(point.y, targets.y),
      top + 1,
      Math.max(top + 1, bounds.height),
    );
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * The rectangle drawn from `start` to `point` on empty space, snapped like
 * a resize, both corners kept inside `bounds`.
 */
export function snapDraw(
  start: { readonly x: number; readonly y: number },
  point: { readonly x: number; readonly y: number },
  targets: SnapTargets,
  threshold: number,
  bounds: Bounds,
): SliceRect {
  const snap = (value: number, axis: readonly number[]): number =>
    Math.round(nearest(value, axis, threshold) ?? value);
  const from = {
    x: clamp(Math.round(start.x), 0, bounds.width),
    y: clamp(Math.round(start.y), 0, bounds.height),
  };
  const to = {
    x: clamp(snap(point.x, targets.x), 0, bounds.width),
    y: clamp(snap(point.y, targets.y), 0, bounds.height),
  };
  const x = clamp(Math.min(from.x, to.x), 0, Math.max(0, bounds.width - 1));
  const y = clamp(Math.min(from.y, to.y), 0, Math.max(0, bounds.height - 1));
  return {
    x,
    y,
    width: Math.max(1, Math.abs(to.x - from.x)),
    height: Math.max(1, Math.abs(to.y - from.y)),
  };
}

/**
 * The scale that puts a placed Slice's bottom-right corner nearest `point`
 * (Projection pixels), snapped so its right or bottom edge meets another
 * Slice's edge within `threshold`, rounded to a thousandth and kept within
 * `bounds`.
 */
export function snapScale(
  slice: Slice,
  point: { readonly x: number; readonly y: number },
  targets: SnapTargets,
  threshold: number,
  bounds: { readonly min: number; readonly max: number },
): number {
  const base = placedRect({ ...slice, scale: 1 });
  const free = Math.max(
    (point.x - slice.position.x) / base.width,
    (point.y - slice.position.y) / base.height,
  );
  const right = slice.position.x + base.width * free;
  const bottom = slice.position.y + base.height * free;
  const toX = nearest(right, targets.x, threshold);
  const toY = nearest(bottom, targets.y, threshold);
  const candidates = [
    ...(toX === undefined ? [] : [(toX - slice.position.x) / base.width]),
    ...(toY === undefined ? [] : [(toY - slice.position.y) / base.height]),
  ].filter((scale) => scale > 0);
  const scale =
    candidates.sort((a, b) => Math.abs(a - free) - Math.abs(b - free))[0] ??
    free;
  return (
    Math.round(Math.min(bounds.max, Math.max(bounds.min, scale)) * 1000) / 1000
  );
}
