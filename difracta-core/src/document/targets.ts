import type {
  Document,
  Region,
  RegionBounds,
  RegionCorner,
  Surface,
} from "./document.ts";
import { REGION_MIN_SIDE } from "./document.ts";
import { roundPoint, type Point } from "./geometry.ts";

/** A rectangle of Surface Space: origin and size, each 0..1. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The whole Surface: what a Layer targeting the Surface itself covers. */
export const WHOLE_SURFACE: Rect = { x: 0, y: 0, width: 1, height: 1 };

/** A Layer's Target resolved: the Surface it lands on and the part of it. */
export interface ResolvedTarget {
  readonly surface: Surface;
  /** The Region, or undefined when the Target is the Surface itself. */
  readonly region: Region | undefined;
  /** Region Space inside Surface Space; the whole square for a Surface. */
  readonly rect: Rect;
}

/**
 * What a Target id names: a Surface, or a Region of one; undefined when it
 * names neither or the Region's Surface is gone. Everything a Layer needs
 * from its Target (mapping, Masks, Paths) belongs to the Surface, so
 * callers read that from here rather than telling Regions apart.
 */
export function resolveTarget(
  document: Pick<Document, "surfaces" | "regions">,
  targetId: string | null,
): ResolvedTarget | undefined {
  if (targetId === null) return undefined;
  const surface = document.surfaces[targetId];
  if (surface !== undefined)
    return { surface, region: undefined, rect: WHOLE_SURFACE };
  const region = document.regions[targetId];
  if (region === undefined) return undefined;
  const owner = document.surfaces[region.surfaceId];
  if (owner === undefined) return undefined;
  return { surface: owner, region, rect: regionRect(region.bounds) };
}

/** The Surface a Target id lands on, or null when it names none. */
export function targetSurfaceId(
  document: Pick<Document, "surfaces" | "regions">,
  targetId: string | null,
): string | null {
  return resolveTarget(document, targetId)?.surface.id ?? null;
}

export function regionRect(bounds: RegionBounds): Rect {
  return {
    x: bounds.topLeft.x,
    y: bounds.topLeft.y,
    width: bounds.bottomRight.x - bounds.topLeft.x,
    height: bounds.bottomRight.y - bounds.topLeft.y,
  };
}

/** A Surface Space point in Region Space: the unit square the Region presents. */
export function toRegionSpace(rect: Rect, point: Point): Point {
  return {
    x: (point.x - rect.x) / rect.width,
    y: (point.y - rect.y) / rect.height,
  };
}

/**
 * The bounds with one corner moved: kept inside Surface Space and at least
 * the minimum side away from the other corner, so a drag past it stops
 * rather than flipping the rectangle.
 */
export function withRegionCorner(
  bounds: RegionBounds,
  corner: RegionCorner,
  point: Point,
): RegionBounds {
  const clamp = (value: number, low: number, high: number): number =>
    Math.min(high, Math.max(low, value));
  if (corner === "topLeft") {
    const topLeft = roundPoint({
      x: clamp(point.x, 0, bounds.bottomRight.x - REGION_MIN_SIDE),
      y: clamp(point.y, 0, bounds.bottomRight.y - REGION_MIN_SIDE),
    });
    return { topLeft, bottomRight: bounds.bottomRight };
  }
  const bottomRight = roundPoint({
    x: clamp(point.x, bounds.topLeft.x + REGION_MIN_SIDE, 1),
    y: clamp(point.y, bounds.topLeft.y + REGION_MIN_SIDE, 1),
  });
  return { topLeft: bounds.topLeft, bottomRight };
}
