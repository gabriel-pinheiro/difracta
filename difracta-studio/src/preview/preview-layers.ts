import {
  childLayers,
  descendantLayers,
  layerEffectivelyEnabled,
  type Layer,
  type Table,
} from "@difracta/core";

const framed = new WeakMap<
  Table<Layer>,
  { readonly layerId: string; readonly layers: Table<Layer> }
>();
const rooted = new WeakMap<Layer, Layer>();

/**
 * The Layers the Preview keeps when it frames one, every other Layer of the
 * document left out. A Visual Layer is kept alone and out of its Groups, so
 * no Group gates it and no Filter Layer applies to it. A Group is kept with
 * everything in it, out of the Groups it is in. A Filter Layer is kept with
 * everything below it in its Scene's stack and the Groups it is in, so the
 * stack is drawn up to and including it. Ids do not change, so the Layers
 * shown keep their Visual Instances, and a Layer the Preview does not move
 * is the Layer itself. `layers` itself when the Layer is gone; the same
 * table while `layers` is the same.
 */
export function framedLayers(
  layers: Table<Layer>,
  layerId: string,
): Table<Layer> {
  const known = framed.get(layers);
  if (known?.layerId === layerId) return known.layers;
  const layer = layers[layerId];
  if (layer === undefined) return layers;
  const kept =
    layer.kind === "visual"
      ? [atRoot(layer)]
      : layer.kind === "group"
        ? [atRoot(layer), ...descendantLayers(layers, layer.id)]
        : [...ancestors(layers, layer), ...stackFrom(layers, layer)];
  const result: Table<Layer> = Object.fromEntries(
    kept.map((entry) => [entry.id, entry]),
  );
  framed.set(layers, { layerId, layers: result });
  return result;
}

/**
 * Whether the framed Layer draws nothing because it is disabled: its own
 * switch for a Visual Layer or a Group, which are shown out of their Groups,
 * and any Group it is in as well for a Filter Layer, which stays in them.
 */
export function framedLayerDisabled(
  layers: Table<Layer>,
  layerId: string,
): boolean {
  const layer = layers[layerId];
  if (layer === undefined) return false;
  return layer.kind === "filter"
    ? !layerEffectivelyEnabled(layers, layer)
    : !layer.enabled;
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

/** The Layer and every Layer after it in its Scene's stack, top first as the navigator shows. */
function stackFrom(layers: Table<Layer>, layer: Layer): readonly Layer[] {
  const stack: Layer[] = [];
  const visit = (parentId: string | null): void => {
    for (const child of childLayers(layers, layer.sceneId, parentId)) {
      stack.push(child);
      if (child.kind === "group") visit(child.id);
    }
  };
  visit(null);
  const index = stack.indexOf(layer);
  return index < 0 ? [layer] : stack.slice(index);
}
