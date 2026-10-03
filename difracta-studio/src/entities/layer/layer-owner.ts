import type { Layer, Table } from "@difracta/core";

/**
 * The Visual Layer a Filter Layer sits inside, when it does. A Filter at
 * the root or in a Group has none: it treats the frame, not a Layer.
 */
export function layerHolder(
  layers: Table<Layer>,
  layer: Layer,
): (Layer & { readonly kind: "visual" }) | undefined {
  if (layer.kind !== "filter" || layer.parentId === null) return undefined;
  const parent = layers[layer.parentId];
  return parent?.kind === "visual" ? parent : undefined;
}

/**
 * How a Layer is named where its properties are listed by owner, in a
 * Link, a Macro action or a picker: its name, and for a Filter inside a
 * Visual Layer that Layer's name first ("Intro clip › Hue Shift"), since
 * the Filter's name alone says nothing about what it treats.
 */
export function layerOwnerName(layers: Table<Layer>, layer: Layer): string {
  const holder = layerHolder(layers, layer);
  return holder === undefined ? layer.name : `${holder.name} › ${layer.name}`;
}
