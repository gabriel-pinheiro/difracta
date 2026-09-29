import type { Mask, Path, Region, Surface, Table } from "@difracta/core";

import type { Selection } from "./selection";

/** Which Mask, Path or Region of a Surface a selection is, if it is one. */
export interface SelectedShape {
  readonly maskId: string | null;
  readonly pathId: string | null;
  readonly regionId: string | null;
}

export interface SurfaceTables {
  readonly surfaces: Table<Surface>;
  readonly masks: Table<Mask>;
  readonly paths: Table<Path>;
  readonly regions: Table<Region>;
}

/** The Surface a selection is, or is part of, and which part of it. */
export function selectionSurface(
  selection: Selection | undefined,
  { surfaces, masks, paths, regions }: SurfaceTables,
): ({ readonly surface: Surface } & SelectedShape) | undefined {
  const none: SelectedShape = { maskId: null, pathId: null, regionId: null };
  const on = (surfaceId: string | undefined, shape: Partial<SelectedShape>) => {
    const surface = surfaceId === undefined ? undefined : surfaces[surfaceId];
    return surface === undefined ? undefined : { surface, ...none, ...shape };
  };
  if (selection?.kind === "surface") return on(selection.id, {});
  if (selection?.kind === "mask")
    return on(masks[selection.id]?.surfaceId, { maskId: selection.id });
  if (selection?.kind === "path")
    return on(paths[selection.id]?.surfaceId, { pathId: selection.id });
  if (selection?.kind === "region")
    return on(regions[selection.id]?.surfaceId, { regionId: selection.id });
  return undefined;
}
