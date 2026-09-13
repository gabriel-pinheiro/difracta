import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { linksOfLayer } from "../address/links.ts";
import type { Document } from "../document/document.ts";
import { descendantLayers } from "../document/layers.ts";
import { dropActionsUnder } from "../document/macros.ts";
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

/**
 * What a removal took with it besides the entity: one line for the Links
 * released and one for the Macro actions dropped, counted from the patches
 * (a removed `links/<id>`; a Macro's `actions` set to a shorter list).
 */
export function removalWarnings(
  document: Document,
  patches: readonly Patch[],
  name: string,
): string[] {
  const links = patches.filter(
    (patch) => patch.op === "remove" && patch.path[0] === "links",
  ).length;
  let actions = 0;
  for (const patch of patches) {
    if (patch.op !== "set" || patch.path[0] !== "macros") continue;
    if (patch.path[2] !== "actions") continue;
    const macro = document.macros[String(patch.path[1])];
    if (macro?.kind !== "macro") continue;
    actions += macro.actions.length - (patch.value as unknown[]).length;
  }
  const warnings: string[] = [];
  if (actions > 0)
    warnings.push(
      `Removed ${actions} Macro action${actions === 1 ? "" : "s"} targeting “${name}”`,
    );
  if (links > 0)
    warnings.push(`Removed ${links} Link${links === 1 ? "" : "s"}`);
  return warnings;
}

/** Removing a Group removes everything inside it, every Link to what goes, and every Macro action on it. */
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
    patches.push(
      ...dropActionsUnder(
        document,
        going.map((id) => `layer/${id}/`),
      ),
    );
    const warnings = removalWarnings(document, patches, layer.name);
    for (const id of going)
      patches.push({ op: "remove", path: ["layers", id] });
    return accepted(patches, undefined, warnings);
  },
});
