import type { Point, Quad } from "@difracta/core";

import type { SnapContext } from "@/inspector/fields/polygon-editor";

/** How close, in screen pixels, a corner comes to a Slice edge before it snaps. */
export const CORNER_SNAP_SCREEN_PX = 6;

/**
 * A dragged corner snapped to the nearest Slice edge on each axis within a
 * few screen pixels, so it lands on a Slice's corner when near both; the
 * point as it is while Alt is held or with no Slices. Slices are their
 * placed rectangles normalized to the Projection Frame.
 */
export function snapCorner(
  point: Point,
  slices: readonly Quad[],
  context: SnapContext,
): Point {
  if (context.altKey || slices.length === 0) return point;
  const xs = slices.flatMap((quad) => [quad.topLeft.x, quad.bottomRight.x]);
  const ys = slices.flatMap((quad) => [quad.topLeft.y, quad.bottomRight.y]);
  return {
    x: closest(point.x, xs, CORNER_SNAP_SCREEN_PX / context.screenPerUnit.x),
    y: closest(point.y, ys, CORNER_SNAP_SCREEN_PX / context.screenPerUnit.y),
  };
}

function closest(value: number, targets: readonly number[], within: number) {
  let best = value;
  let distance = within;
  for (const target of targets) {
    const gap = Math.abs(target - value);
    if (gap <= distance) {
      best = target;
      distance = gap;
    }
  }
  return best;
}
