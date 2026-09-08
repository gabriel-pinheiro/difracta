import { z } from "zod";

/**
 * Geometry shared by Surfaces and, through them, everything drawn: points in
 * a normalized space and the four-corner quadrilateral a Surface Mapping is.
 * A Projection Frame point may lie outside the unit square when a Surface
 * overshoots the projector's edge.
 */
export const PointSchema = z.object({ x: z.number(), y: z.number() }).strict();
export type Point = z.infer<typeof PointSchema>;

/** Corners in drawing order, clockwise from the top left. */
export const CORNERS = [
  "topLeft",
  "topRight",
  "bottomRight",
  "bottomLeft",
] as const;
export const CornerNameSchema = z.enum(CORNERS);
export type CornerName = z.infer<typeof CornerNameSchema>;

export const QuadSchema = z
  .object({
    topLeft: PointSchema,
    topRight: PointSchema,
    bottomRight: PointSchema,
    bottomLeft: PointSchema,
  })
  .strict();
export type Quad = z.infer<typeof QuadSchema>;

/** The whole Projection Frame: what a new Surface Mapping covers. */
export const FULL_FRAME: Quad = {
  topLeft: { x: 0, y: 0 },
  topRight: { x: 1, y: 0 },
  bottomRight: { x: 1, y: 1 },
  bottomLeft: { x: 0, y: 1 },
};

/** Millionths of the frame: far below a pixel at any resolution, and keeps files free of float noise. */
const PRECISION = 1_000_000;

export function roundPoint(point: Point): Point {
  return {
    x: Math.round(point.x * PRECISION) / PRECISION,
    y: Math.round(point.y * PRECISION) / PRECISION,
  };
}

export function addPoints(point: Point, delta: Point): Point {
  return roundPoint({ x: point.x + delta.x, y: point.y + delta.y });
}
