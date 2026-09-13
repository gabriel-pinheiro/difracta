import { expect } from "vitest";

import type { Frame } from "./harness.ts";

/**
 * Reading a rendered frame: single pixels, the mean over a rectangle, how
 * many pixels are lit, and the width of the ramp across an edge along a
 * scanline or a column. Colours are RGB 0..255; a pixel is "lit" when any
 * channel passes the threshold.
 */
export type RGB = readonly [number, number, number];

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function pixel(frame: Frame, x: number, y: number): RGB {
  const offset = (y * frame.width + x) * 4;
  return [
    frame.pixels[offset] ?? 0,
    frame.pixels[offset + 1] ?? 0,
    frame.pixels[offset + 2] ?? 0,
  ];
}

export function mean(frame: Frame, rect: Rect): RGB {
  let r = 0;
  let g = 0;
  let b = 0;
  for (let y = rect.y; y < rect.y + rect.height; y += 1)
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const color = pixel(frame, x, y);
      r += color[0];
      g += color[1];
      b += color[2];
    }
  const count = rect.width * rect.height;
  return [r / count, g / count, b / count];
}

export function isLit(color: RGB, threshold = 128): boolean {
  return color.some((channel) => channel > threshold);
}

/** Pixels with any channel above the threshold, over the frame or a rectangle of it. */
export function countLit(frame: Frame, threshold = 128, rect?: Rect): number {
  const area = rect ?? { x: 0, y: 0, width: frame.width, height: frame.height };
  let count = 0;
  for (let y = area.y; y < area.y + area.height; y += 1)
    for (let x = area.x; x < area.x + area.width; x += 1)
      if (isLit(pixel(frame, x, y), threshold)) count += 1;
  return count;
}

/** The red channel along row `y` from `x0` to `x1` inclusive. */
export function scanline(
  frame: Frame,
  y: number,
  x0: number,
  x1: number,
): readonly number[] {
  const values: number[] = [];
  for (let x = x0; x <= x1; x += 1) values.push(pixel(frame, x, y)[0]);
  return values;
}

/** The red channel down column `x` from `y0` to `y1` inclusive. */
export function column(
  frame: Frame,
  x: number,
  y0: number,
  y1: number,
): readonly number[] {
  const values: number[] = [];
  for (let y = y0; y <= y1; y += 1) values.push(pixel(frame, x, y)[0]);
  return values;
}

/**
 * How many samples lie strictly between background and fill: the width
 * of the fade across an edge, in pixels, when the line crosses one edge.
 * A one-pixel fade puts a single pixel centre inside it, whose value can
 * fall anywhere in between, so it counts every value off both ends.
 */
export function rampWidth(
  values: readonly number[],
  background = 0,
  fill = 255,
): number {
  return values.filter((value) => value > background && value < fill).length;
}

/**
 * Where a line first reaches half the fill, as an offset from its start,
 * or -1 when it never does: the middle of a feather, which a blur moves
 * only when it is clipped.
 */
export function halfCrossing(values: readonly number[], fill = 255): number {
  return values.findIndex((value) => value >= fill / 2);
}

/** True when both frames hold exactly the same pixels. */
export function samePixels(a: Frame, b: Frame): boolean {
  return (
    a.pixels.length === b.pixels.length &&
    a.pixels.every((byte, index) => byte === b.pixels[index])
  );
}

export function expectColor(actual: RGB, expected: RGB, tolerance = 2): void {
  for (const channel of [0, 1, 2] as const)
    expect(
      Math.abs(actual[channel] - expected[channel]),
      `channel ${channel} of [${actual.join(", ")}] against [${expected.join(", ")}]`,
    ).toBeLessThanOrEqual(tolerance);
}

/** A quad in frame pixels, as the corners in order around it. */
export type PixelQuad = readonly (readonly [number, number])[];

/**
 * Signed distance from a pixel centre to the nearest edge of a convex
 * quad, positive inside. Pixels farther than a margin from every edge are
 * unambiguously inside or outside, whatever the edge feather does.
 */
export function quadDistance(quad: PixelQuad, x: number, y: number): number {
  let nearest = Infinity;
  const px = x + 0.5;
  const py = y + 0.5;
  // Clockwise on screen (y down) puts the inside on the right of each edge.
  quad.forEach(([x0, y0], index) => {
    const [x1, y1] = quad[(index + 1) % quad.length] ?? [x0, y0];
    const length = Math.hypot(x1 - x0, y1 - y0) || 1;
    const distance = ((x1 - x0) * (py - y0) - (y1 - y0) * (px - x0)) / length;
    nearest = Math.min(nearest, distance);
  });
  return nearest;
}

/**
 * Checks every pixel farther than `margin` from the quad's edges: lit
 * inside, dark outside. Returns the number of pixels breaking that.
 */
export function quadViolations(
  frame: Frame,
  quad: PixelQuad,
  margin = 2,
  threshold = 128,
): number {
  let violations = 0;
  for (let y = 0; y < frame.height; y += 1)
    for (let x = 0; x < frame.width; x += 1) {
      const distance = quadDistance(quad, x, y);
      if (Math.abs(distance) < margin) continue;
      const lit = isLit(pixel(frame, x, y), threshold);
      if (lit !== distance > 0) violations += 1;
    }
  return violations;
}
