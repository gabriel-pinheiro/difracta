import type { Catalog } from "../catalog/catalog.ts";
import type { Document, Mask, Path, VisualLayer } from "./document.ts";
import { compareOrdered } from "./order.ts";

/** One of a Surface's children in the navigator: Masks and Paths share one order. */
export type SurfaceChild =
  | { readonly table: "masks"; readonly entity: Mask }
  | { readonly table: "paths"; readonly entity: Path };

/** The Masks and Paths of a Surface together, in their shared display order. */
export function surfaceChildren(
  document: Pick<Document, "masks" | "paths">,
  surfaceId: string,
): readonly SurfaceChild[] {
  const children: SurfaceChild[] = [];
  for (const entity of Object.values(document.masks))
    if (entity.surfaceId === surfaceId)
      children.push({ table: "masks", entity });
  for (const entity of Object.values(document.paths))
    if (entity.surfaceId === surfaceId)
      children.push({ table: "paths", entity });
  return children.sort((a, b) => compareOrdered(a.entity, b.entity));
}

/** The Paths of a Surface in display order. */
export function pathsOf(
  document: Pick<Document, "masks" | "paths">,
  surfaceId: string,
): readonly Path[] {
  return surfaceChildren(document, surfaceId).flatMap((child) =>
    child.table === "paths" ? [child.entity] : [],
  );
}

/**
 * The bindings a Visual Layer keeps for a Visual and a Target: one per Path
 * the Visual declares, kept only while its Path is on the Target's Surface.
 * Anything else is dropped rather than refused, so picking a Visual or a
 * Target always works and the Layer says what it still needs.
 */
export function fitPaths(
  document: Pick<Document, "paths">,
  catalog: Catalog,
  visualId: string | null,
  target: string | null,
  current: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const definition = visualId === null ? undefined : catalog.visual(visualId);
  const kept: Record<string, string> = {};
  for (const requirement of definition?.paths ?? []) {
    const pathId = current[requirement.key];
    if (pathId === undefined) continue;
    const path = document.paths[pathId];
    if (path !== undefined && target !== null && path.surfaceId === target)
      kept[requirement.key] = pathId;
  }
  return kept;
}

/** The keys a Layer's Visual declares that have no usable Path bound. */
export function unboundPaths(
  document: Pick<Document, "paths">,
  catalog: Catalog,
  layer: VisualLayer,
): readonly string[] {
  if (layer.visual === null) return [];
  const fitted = fitPaths(
    document,
    catalog,
    layer.visual,
    layer.target,
    layer.paths,
  );
  return (catalog.visual(layer.visual)?.paths ?? [])
    .map((requirement) => requirement.key)
    .filter((key) => !(key in fitted));
}

/**
 * The Paths a Layer renders with, by the Visual's keys; undefined while any
 * declared Path is unbound or off the Target, since the Visual cannot run
 * without every one of them.
 */
export function resolveLayerPaths(
  document: Pick<Document, "paths">,
  catalog: Catalog,
  layer: VisualLayer,
): Readonly<Record<string, Path>> | undefined {
  if (layer.visual === null) return undefined;
  const requirements = catalog.visual(layer.visual)?.paths ?? [];
  const resolved: Record<string, Path> = {};
  for (const requirement of requirements) {
    const pathId = layer.paths[requirement.key];
    const path = pathId === undefined ? undefined : document.paths[pathId];
    if (path?.surfaceId !== layer.target) return undefined;
    resolved[requirement.key] = path;
  }
  return resolved;
}
