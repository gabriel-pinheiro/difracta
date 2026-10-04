import type { Mask, MaskMode, OutputMask, Point } from "@difracta/core";

import type { createScratchCanvas } from "./gl.ts";

export type Scratch = ReturnType<typeof createScratchCanvas>;
type Context = Scratch["context"];

/** A polygon that opens or closes its area: a Mask or an Output Mask. */
export type MaskPolygon = Pick<
  Mask | OutputMask,
  "mode" | "points" | "feather"
>;

/**
 * How a mask space lands on its scratch canvas. The canvas transform is
 * `scale` on both axes; `map` takes a point of the space into the units
 * under that transform, where a stroke of `feather` is drawn; `blurPx`
 * is the blur that softens the feather, in texels.
 */
export interface MaskSpace {
  readonly width: number;
  readonly height: number;
  readonly scale: readonly [number, number];
  map(point: Point): Point;
  blurPx(feather: number): number;
}

/**
 * Surface Space: the unit square scaled to the texture, strokes included,
 * so a feather is the same fraction of the Surface on both axes whatever
 * the texture's aspect. Only the blur is in texels, from the mean side.
 */
export function surfaceSpace(width: number, height: number): MaskSpace {
  return {
    width,
    height,
    scale: [width, height],
    map: (point) => point,
    blurPx: (feather) => (feather * (width + height)) / 8,
  };
}

/**
 * The Projection Frame: the frame scaled by its mean side on both axes, so
 * a feather is the same number of pixels whichever way an edge runs; the
 * frame's own aspect goes into the points.
 */
export function frameSpace(width: number, height: number): MaskSpace {
  const mean = (width + height) / 2;
  return {
    width,
    height,
    scale: [mean, mean],
    map: (point) => ({
      x: (point.x * width) / mean,
      y: (point.y * height) / mean,
    }),
    blurPx: (feather) => (feather * mean) / 4,
  };
}

/** The whole canvas, in the units under the space's transform. */
function extent(space: MaskSpace): readonly [number, number] {
  return [space.width / space.scale[0], space.height / space.scale[1]];
}

/**
 * Composes masks onto `layer`'s canvas, alpha being coverage: open area
 * by default, closed area when `inverted`. The rule is the same both
 * ways: fully open without include masks and fully closed with any, then
 * each mask in order opens or closes its polygon. Feather extends the
 * dark side: an include mask fades inward from its edge, clipped to its
 * polygon; an exclude mask is dark over its whole polygon and fades
 * outward past it. `shape` is a second scratch canvas of the same size
 * the feathered shapes are drawn into before they are blurred.
 */
export function composeMasks(
  layer: Scratch,
  shape: Scratch,
  masks: readonly MaskPolygon[],
  space: MaskSpace,
  inverted = false,
): void {
  const { context } = layer;
  const [sx, sy] = space.scale;
  const [w, h] = extent(space);
  context.setTransform(sx, 0, 0, sy, 0, 0);
  context.globalCompositeOperation = "source-over";
  context.filter = "none";
  context.clearRect(0, 0, w, h);
  context.fillStyle = "#fff";
  const hasInclude = masks.some((mask) => mask.mode === "include");
  if (hasInclude === inverted) context.fillRect(0, 0, w, h);
  for (const mask of masks) {
    const opens = (mask.mode === "include") !== inverted;
    const blurPx = space.blurPx(mask.feather);
    context.save();
    context.globalCompositeOperation = opens
      ? "source-over"
      : "destination-out";
    if (blurPx < 0.25 || mask.mode === "exclude") {
      tracePolygon(context, mask.points, space);
      context.fill();
    }
    if (blurPx >= 0.25) {
      if (mask.mode === "include") {
        tracePolygon(context, mask.points, space);
        context.clip();
      }
      featheredShape(shape.context, mask, space);
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.filter = `blur(${String(blurPx)}px)`;
      context.drawImage(shape.canvas, 0, 0);
    }
    context.restore();
  }
}

export function tracePolygon(
  context: Context,
  points: readonly Point[],
  space: MaskSpace,
): void {
  context.beginPath();
  points.forEach((point, index) => {
    const { x, y } = space.map(point);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.closePath();
}

/**
 * The polygon moved by half the feather towards its dark side: a stroke
 * centred on the boundary erodes an include mask that much inward, and
 * dilates an exclude mask that much outward. Blurred by the caller, the
 * result ramps over the feather from the polygon's edge.
 */
export function featheredShape(
  context: Context,
  { points, feather, mode }: MaskPolygon & { readonly mode: MaskMode },
  space: MaskSpace,
): void {
  const [sx, sy] = space.scale;
  const [w, h] = extent(space);
  context.setTransform(sx, 0, 0, sy, 0, 0);
  context.filter = "none";
  context.globalCompositeOperation = "source-over";
  context.clearRect(0, 0, w, h);
  context.fillStyle = "#fff";
  context.strokeStyle = "#fff";
  tracePolygon(context, points, space);
  context.fill();
  context.globalCompositeOperation =
    mode === "include" ? "destination-out" : "source-over";
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = feather;
  tracePolygon(context, points, space);
  context.stroke();
}

/** Whether two mask lists hold the same objects in the same order; the document is immutable per revision, so identity is exact. */
export function sameMasks(
  a: readonly MaskPolygon[],
  b: readonly MaskPolygon[],
): boolean {
  return a.length === b.length && a.every((mask, index) => mask === b[index]);
}
