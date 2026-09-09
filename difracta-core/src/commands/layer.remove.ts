import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { descendantLayers } from "../document/layers.ts";
import type { Patch } from "../document/patch.ts";

/** Removing a Group removes everything inside it. */
export const layerRemove = defineCommand({
  name: "layer.remove",
  kind: "authoring",
  description: "Remove a Layer; a Group goes with its contents.",
  payload: z.object({ layerId: z.string().min(1) }).strict(),
  label: () => "Remove Layer",
  apply({ document, payload }) {
    const layer = document.layers[payload.layerId];
    if (layer === undefined)
      return rejected(`Layer “${payload.layerId}” does not exist.`);
    const patches: Patch[] = descendantLayers(document.layers, layer.id).map(
      (child) => ({ op: "remove", path: ["layers", child.id] }),
    );
    patches.push({ op: "remove", path: ["layers", layer.id] });
    return accepted(patches);
  },
});
