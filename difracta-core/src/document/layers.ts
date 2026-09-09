import type { Layer, LayerKind, Table } from "./document.ts";
import { orderedEntries } from "./order.ts";

export const LAYER_LABELS: Record<LayerKind, string> = {
  visual: "Layer",
  filter: "Filter",
  group: "Group",
};

/** The Layers directly under a Scene root (`parentId` null) or a Group, in order. */
export function childLayers(
  layers: Table<Layer>,
  sceneId: string,
  parentId: string | null,
): readonly Layer[] {
  return orderedEntries(layers).filter(
    (layer) => layer.sceneId === sceneId && layer.parentId === parentId,
  );
}

/** Every Layer below `layerId`, depth first in display order; empty unless it is a Group. */
export function descendantLayers(
  layers: Table<Layer>,
  layerId: string,
): readonly Layer[] {
  const root = layers[layerId];
  if (root?.kind !== "group") return [];
  const result: Layer[] = [];
  const visit = (parent: Layer): void => {
    for (const child of childLayers(layers, parent.sceneId, parent.id)) {
      result.push(child);
      if (child.kind === "group") visit(child);
    }
  };
  visit(root);
  return result;
}

/** Whether the Layer and every Group above it are enabled. */
export function layerEffectivelyEnabled(
  layers: Table<Layer>,
  layer: Layer,
): boolean {
  let current: Layer | undefined = layer;
  while (current !== undefined) {
    if (!current.enabled) return false;
    current = current.parentId === null ? undefined : layers[current.parentId];
  }
  return true;
}
