import {
  childLayers,
  descendantLayers,
  layerEffectivelyEnabled,
  layerHoldsChildren,
  type Layer,
  type Table,
} from "@difracta/core";

import { layerHolder } from "../entities/layer/layer-owner";

const framed = new WeakMap<
  Table<Layer>,
  { readonly layerId: string; readonly layers: Table<Layer> }
>();
const rooted = new WeakMap<Layer, Layer>();

/**
 * The Layers the Preview keeps when it frames one, every other Layer of the
 * document left out. A Visual Layer is kept alone and out of its Groups,
 * with the Filter Layers inside it, so no Group gates it and no root Filter
 * Layer applies to it. A Filter Layer inside a Visual Layer is kept as that
 * Layer with its Filters from the bottom up to and including itself. A
 * Group is kept with everything in it, out of the Groups it is in. Any
 * other Filter Layer is kept with everything below it in its Scene's stack
 * and the Groups it is in, so the stack is drawn up to and including it.
 * Ids do not change, so the Layers shown keep their Visual Instances, and a
 * Layer the Preview does not move is the Layer itself. `layers` itself when
 * the Layer is gone; the same table while `layers` is the same.
 */
export function framedLayers(
  layers: Table<Layer>,
  layerId: string,
): Table<Layer> {
  const known = framed.get(layers);
  if (known?.layerId === layerId) return known.layers;
  const layer = layers[layerId];
  if (layer === undefined) return layers;
  const holder = layerHolder(layers, layer);
  const kept =
    layer.kind === "visual"
      ? [atRoot(layer), ...descendantLayers(layers, layer.id)]
      : layer.kind === "group"
        ? [atRoot(layer), ...descendantLayers(layers, layer.id)]
        : holder !== undefined
          ? [atRoot(holder), ...filtersUpTo(layers, holder, layer)]
          : [...ancestors(layers, layer), ...stackFrom(layers, layer)];
  const result: Table<Layer> = Object.fromEntries(
    kept.map((entry) => [entry.id, entry]),
  );
  framed.set(layers, { layerId, layers: result });
  return result;
}

/**
 * Whether the framed Layer draws nothing because it is disabled: its own
 * switch for a Visual Layer or a Group, which are shown out of their Groups;
 * its own or its Visual Layer's for a Filter Layer inside one, shown out of
 * the Groups too; and any Group it is in as well for any other Filter Layer,
 * which stays in them.
 */
export function framedLayerDisabled(
  layers: Table<Layer>,
  layerId: string,
): boolean {
  const layer = layers[layerId];
  if (layer === undefined) return false;
  if (layer.kind !== "filter") return !layer.enabled;
  const holder = layerHolder(layers, layer);
  return holder === undefined
    ? !layerEffectivelyEnabled(layers, layer)
    : !layer.enabled || !holder.enabled;
}

/** The Layer at its Scene's root; the same copy for the same Layer. */
function atRoot(layer: Layer): Layer {
  if (layer.parentId === null) return layer;
  const known = rooted.get(layer);
  if (known !== undefined) return known;
  const copy = { ...layer, parentId: null };
  rooted.set(layer, copy);
  return copy;
}

/** The Groups a Layer is in, innermost first. */
function ancestors(layers: Table<Layer>, layer: Layer): readonly Layer[] {
  const result: Layer[] = [];
  let parentId = layer.parentId;
  while (parentId !== null) {
    const parent = layers[parentId];
    if (parent === undefined) break;
    result.push(parent);
    parentId = parent.parentId;
  }
  return result;
}

/** A Visual Layer's Filters from the bottom up to and including `filter`, top first as listed. */
function filtersUpTo(
  layers: Table<Layer>,
  holder: Layer,
  filter: Layer,
): readonly Layer[] {
  const filters = childLayers(layers, holder.sceneId, holder.id);
  const index = filters.indexOf(filter);
  return index < 0 ? [filter] : filters.slice(index);
}

/**
 * The Layer and every Layer after it in its Scene's stack, top first as the
 * navigator shows, a Visual Layer's Filters right after it.
 */
function stackFrom(layers: Table<Layer>, layer: Layer): readonly Layer[] {
  const stack: Layer[] = [];
  const visit = (parentId: string | null): void => {
    for (const child of childLayers(layers, layer.sceneId, parentId)) {
      stack.push(child);
      if (layerHoldsChildren(child)) visit(child.id);
    }
  };
  visit(null);
  const index = stack.indexOf(layer);
  return index < 0 ? [layer] : stack.slice(index);
}
