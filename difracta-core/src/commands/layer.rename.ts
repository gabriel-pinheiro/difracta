import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { childLayers } from "../document/layers.ts";
import { uniqueName } from "../document/names.ts";

export const layerRename = defineCommand({
  name: "layer.rename",
  kind: "authoring",
  description: "Rename a Layer.",
  payload: z
    .object({
      layerId: z.string().min(1),
      name: z.string().trim().min(1).max(120),
    })
    .strict(),
  label: () => "Rename Layer",
  coalesceKey: ({ layerId }) => `layer.rename:${layerId}`,
  apply({ document, payload }) {
    const layer = document.layers[payload.layerId];
    if (layer === undefined)
      return rejected(`Layer “${payload.layerId}” does not exist.`);
    const name = uniqueName(
      childLayers(document.layers, layer.sceneId, layer.parentId)
        .filter((sibling) => sibling.id !== layer.id)
        .map((sibling) => sibling.name),
      payload.name,
    );
    if (name === layer.name) return accepted([]);
    return accepted([
      { op: "set", path: ["layers", layer.id, "name"], value: name },
    ]);
  },
});
