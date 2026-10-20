import type {
  MappingFollow,
  Output,
  Slice,
  SliceRect,
  Table,
} from "./document.ts";
import {
  roundPoint,
  type CornerName,
  type Point,
  type Quad,
} from "./geometry.ts";
import { orderedEntries } from "./order.ts";

/**
 * Where an Output's Slices sit, read alike by core, render and Studio. A
 * Slice's placed rectangle is its Display rectangle turned by its rotation
 * and multiplied by its scale, its top-left at its position. The Projection
 * Frame of an Output with Slices is the bounding box of every placed Slice;
 * without Slices it is the Display Frame itself.
 */

/** A rectangle in pixels; a placed Slice's size may be fractional. */
export interface PixelRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The Output's Slices in order. */
export function outputSlices(
  slices: Table<Slice>,
  outputId: string,
): readonly Slice[] {
  return orderedEntries(slices).filter((slice) => slice.outputId === outputId);
}

/** Whether the Output has any Slice, so its Display Frame is sliced. */
export function isSliced(slices: Table<Slice>, outputId: string): boolean {
  return Object.values(slices).some((slice) => slice.outputId === outputId);
}

/** Quarter turns make width and height trade places. */
function turnsSideways(slice: Pick<Slice, "rotation">): boolean {
  return slice.rotation === 90 || slice.rotation === 270;
}

/** The Slice's rectangle as placed in the Projection layout, in Projection pixels. */
export function placedRect(
  slice: Pick<Slice, "rect" | "position" | "rotation" | "scale">,
): PixelRect {
  const sideways = turnsSideways(slice);
  return {
    x: slice.position.x,
    y: slice.position.y,
    width: (sideways ? slice.rect.height : slice.rect.width) * slice.scale,
    height: (sideways ? slice.rect.width : slice.rect.height) * slice.scale,
  };
}

/**
 * The Projection Frame in Projection pixels: the bounding box of the placed
 * Slices, its origin the smallest placed corner, its size rounded up to
 * whole pixels. With no Slices, the Display Frame at the origin, or
 * undefined while the Output has no Display size.
 */
export function projectionFrame(
  output: Pick<Output, "displaySize">,
  slices: readonly Slice[],
): PixelRect | undefined {
  if (slices.length === 0) {
    const size = output.displaySize;
    return size === null
      ? undefined
      : { x: 0, y: 0, width: size.width, height: size.height };
  }
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const slice of slices) {
    const placed = placedRect(slice);
    left = Math.min(left, placed.x);
    top = Math.min(top, placed.y);
    right = Math.max(right, placed.x + placed.width);
    bottom = Math.max(bottom, placed.y + placed.height);
  }
  return {
    x: left,
    y: top,
    width: Math.max(1, Math.ceil(right - left - EPSILON)),
    height: Math.max(1, Math.ceil(bottom - top - EPSILON)),
  };
}

/** Slack for float noise in a scaled side, so 1920 × 1.000 never rounds up to 1921. */
const EPSILON = 1e-6;

/** A Projection pixel point as normalized Projection Frame coordinates. */
export function toFrame(point: Point, frame: PixelRect): Point {
  return roundPoint({
    x: (point.x - frame.x) / frame.width,
    y: (point.y - frame.y) / frame.height,
  });
}

/** A normalized Projection Frame point as Projection pixels. */
export function fromFrame(point: Point, frame: PixelRect): Point {
  return {
    x: frame.x + point.x * frame.width,
    y: frame.y + point.y * frame.height,
  };
}

/** An axis-aligned pixel rectangle as a normalized quad in the frame. */
export function rectQuad(rect: PixelRect, frame: PixelRect): Quad {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  return {
    topLeft: toFrame({ x: rect.x, y: rect.y }, frame),
    topRight: toFrame({ x: right, y: rect.y }, frame),
    bottomRight: toFrame({ x: right, y: bottom }, frame),
    bottomLeft: toFrame({ x: rect.x, y: bottom }, frame),
  };
}

/**
 * Where a following mapping lands, in normalized Projection Frame
 * coordinates: the Slice's placed rectangle or the whole frame. Undefined
 * when the Output has no Slices or the Slice is not one of them.
 */
export function followedQuad(
  output: Pick<Output, "id" | "displaySize">,
  slices: Table<Slice>,
  follow: MappingFollow,
): Quad | undefined {
  const own = outputSlices(slices, output.id);
  const frame = projectionFrame(output, own);
  if (own.length === 0 || frame === undefined) return undefined;
  if ("frame" in follow) return rectQuad(frame, frame);
  const slice = own.find((candidate) => candidate.id === follow.slice);
  return slice === undefined ? undefined : rectQuad(placedRect(slice), frame);
}

/**
 * Where each corner of the Slice's Display rectangle lands in the Projection
 * layout, in Projection pixels: the transform the slice pass inverts.
 */
export function placedCorners(
  slice: Pick<Slice, "rect" | "position" | "rotation" | "scale">,
): Readonly<Record<CornerName, Point>> {
  const placed = placedRect(slice);
  const left = placed.x;
  const top = placed.y;
  const right = placed.x + placed.width;
  const bottom = placed.y + placed.height;
  const tl = { x: left, y: top };
  const tr = { x: right, y: top };
  const br = { x: right, y: bottom };
  const bl = { x: left, y: bottom };
  switch (slice.rotation) {
    case 0:
      return { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl };
    case 90:
      return { topLeft: tr, topRight: br, bottomRight: bl, bottomLeft: tl };
    case 180:
      return { topLeft: br, topRight: bl, bottomRight: tl, bottomLeft: tr };
    case 270:
      return { topLeft: bl, topRight: tl, bottomRight: tr, bottomLeft: br };
  }
}

/** Whether two Display rectangles share any pixel. */
export function rectsOverlap(first: SliceRect, second: SliceRect): boolean {
  return (
    first.x < second.x + second.width &&
    second.x < first.x + first.width &&
    first.y < second.y + second.height &&
    second.y < first.y + first.height
  );
}

/** The first of `slices` whose Display rectangle overlaps `rect`. */
export function overlappingSlice(
  slices: readonly Slice[],
  rect: SliceRect,
): Slice | undefined {
  return slices.find((slice) => rectsOverlap(slice.rect, rect));
}

/**
 * The Slices of `slices` whose Display rectangles overlap another's, with
 * the ones each overlaps. Overlap is allowed while Slices are arranged; the
 * later Slice in order wins those pixels, and Studio flags it until fixed.
 */
export function displayOverlaps(
  slices: readonly Slice[],
): ReadonlyMap<string, readonly Slice[]> {
  const overlaps = new Map<string, Slice[]>();
  for (const [index, first] of slices.entries())
    for (const second of slices.slice(index + 1)) {
      if (!rectsOverlap(first.rect, second.rect)) continue;
      overlaps.set(first.id, [...(overlaps.get(first.id) ?? []), second]);
      overlaps.set(second.id, [...(overlaps.get(second.id) ?? []), first]);
    }
  return overlaps;
}

/** Whether the rectangle lies inside a Display Frame of `size`. */
export function insideDisplay(
  rect: SliceRect,
  size: { readonly width: number; readonly height: number },
): boolean {
  return (
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.x + rect.width <= size.width &&
    rect.y + rect.height <= size.height
  );
}

/** Scale kept to a thousandth, so files stay free of float noise. */
export function roundScale(scale: number): number {
  return Math.round(scale * 1000) / 1000;
}
