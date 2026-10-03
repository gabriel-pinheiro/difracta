import type { RowParent } from "@/navigator/ancestor-rows";

/** A Layer's row is under its Group or, for a nested Filter Layer, its Visual Layer, else under its Scene. */
export const layerParent: RowParent = (document, id) => {
  const layer = document.layers[id];
  if (layer === undefined) return undefined;
  return layer.parentId === null
    ? { kind: "scene", id: layer.sceneId }
    : { kind: "layer", id: layer.parentId };
};
