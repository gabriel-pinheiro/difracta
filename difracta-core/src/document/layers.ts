import type { Layer, LayerKind, Table } from "./document.ts";
import { orderedEntries } from "./order.ts";

export const LAYER_LABELS: Record<LayerKind, string> = {
  visual: "Layer",
  filter: "Filter",
  group: "Group",
};

/** Whether a Layer may hold others: a Group holds any kind, a Visual Layer holds Filter Layers. */
export function layerHoldsChildren(layer: Layer): boolean {
  return layer.kind !== "filter";
}

/**
 * Whether `layer` may go under `parent`: anything under a Group, only a
 * Filter Layer under a Visual Layer, nothing under a Filter Layer. The
 * reason when it may not, for a command's message.
 */
export function layerNestingProblem(
  layer: Pick<Layer, "kind">,
  parent: Layer,
): string | undefined {
  if (parent.kind === "group") return undefined;
  if (parent.kind === "visual")
    return layer.kind === "filter"
      ? undefined
      : `Only a Filter Layer can go inside a Visual Layer; “${parent.name}” cannot hold a ${LAYER_LABELS[layer.kind]}.`;
  return `A Filter Layer holds no Layers; “${parent.name}” cannot be a parent.`;
}

/** The Layers directly under a Scene root (`parentId` null), a Group or a Visual Layer, in order. */
export function childLayers(
  layers: Table<Layer>,
  sceneId: string,
  parentId: string | null,
): readonly Layer[] {
  return orderedEntries(layers).filter(
    (layer) => layer.sceneId === sceneId && layer.parentId === parentId,
  );
}

/**
 * Every Layer below `layerId`, depth first in display order: a Group's
 * contents, a Visual Layer's Filter Layers; empty for a Filter Layer.
 */
export function descendantLayers(
  layers: Table<Layer>,
  layerId: string,
): readonly Layer[] {
  const root = layers[layerId];
  if (root === undefined || !layerHoldsChildren(root)) return [];
  const result: Layer[] = [];
  const visit = (parent: Layer): void => {
    for (const child of childLayers(layers, parent.sceneId, parent.id)) {
      result.push(child);
      if (layerHoldsChildren(child)) visit(child);
    }
  };
  visit(root);
  return result;
}

/** Whether the Layer and every Group or Visual Layer above it are enabled. */
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
