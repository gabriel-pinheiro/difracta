import {
  toRegionSpace,
  type Path,
  type Quad,
  type Rect,
  type Region,
} from "@difracta/core";

import { homography, project } from "./homography.ts";

/**
 * Where a Region lands: its rectangle's corners through the Surface's
 * mapping. Kept per Region and mapping, which are immutable per document
 * revision, so a frame that changes neither reuses the same object and the
 * geometry cache sees no change.
 */
const regionCornerCache = new WeakMap<
  Region,
  WeakMap<Quad, Quad | undefined>
>();
export function regionCorners(region: Region, mapping: Quad): Quad | undefined {
  let byMapping = regionCornerCache.get(region);
  if (byMapping === undefined) {
    byMapping = new WeakMap();
    regionCornerCache.set(region, byMapping);
  }
  if (byMapping.has(mapping)) return byMapping.get(mapping);
  const matrix = homography(mapping);
  const { topLeft, bottomRight } = region.bounds;
  const corners =
    matrix === undefined
      ? undefined
      : {
          topLeft: project(matrix, topLeft.x, topLeft.y),
          topRight: project(matrix, bottomRight.x, topLeft.y),
          bottomRight: project(matrix, bottomRight.x, bottomRight.y),
          bottomLeft: project(matrix, topLeft.x, bottomRight.y),
        };
  byMapping.set(mapping, corners);
  return corners;
}

/** The Paths in Region Space, so the Visual draws them where they are on the Surface; cached like the corners. */
const regionPathCache = new WeakMap<Region, WeakMap<Path, Path>>();
export function regionPaths(
  region: Region,
  paths: Readonly<Record<string, Path>>,
): Readonly<Record<string, Path>> {
  let byPath = regionPathCache.get(region);
  if (byPath === undefined) {
    byPath = new WeakMap();
    regionPathCache.set(region, byPath);
  }
  const rect = resolveRect(region);
  const mapped: Record<string, Path> = {};
  for (const [key, path] of Object.entries(paths)) {
    let entry = byPath.get(path);
    if (entry === undefined) {
      entry = {
        ...path,
        points: path.points.map((point) => toRegionSpace(rect, point)),
      };
      byPath.set(path, entry);
    }
    mapped[key] = entry;
  }
  return mapped;
}

function resolveRect(region: Region): Rect {
  const { topLeft, bottomRight } = region.bounds;
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
}

/** Every Surface, for callers that only draw whole Surfaces. */
