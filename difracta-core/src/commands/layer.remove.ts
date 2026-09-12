import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { linksOfLayer } from "../address/links.ts";
import type { Document } from "../document/document.ts";
import { descendantLayers } from "../document/layers.ts";
import type { Patch } from "../document/patch.ts";

/** Patches removing every Link whose target is on one of `layerIds`. */
export function removeLinksOfLayers(
  document: Document,
  layerIds: readonly string[],
): Patch[] {
  return layerIds.flatMap((layerId) =>
    linksOfLayer(document.links, layerId).map((link): Patch => ({
      op: "remove",
      path: ["links", link.id],
    })),
  );
}

/** Removing a Group removes everything inside it, and every Link to what goes. */
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
    const going = [
      ...descendantLayers(document.layers, layer.id).map((child) => child.id),
      layer.id,
    ];
    const patches: Patch[] = removeLinksOfLayers(document, going);
    for (const id of going)
      patches.push({ op: "remove", path: ["layers", id] });
    return accepted(patches);
  },
});
