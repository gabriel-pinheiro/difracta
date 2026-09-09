import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import type { Document, Layer } from "../document/document.ts";
import { childLayers } from "../document/layers.ts";
import { uniqueName } from "../document/names.ts";
import { orderKeysAfter, orderKeysForMove } from "../document/order.ts";
import type { Patch } from "../document/patch.ts";
import { generateId, id } from "../ids.ts";

/**
 * Patches that copy `layers` (siblings, in order) with their contents under
 * `sceneId`/`parentId`, with fresh ids. `after` places the copies after that
 * sibling; undefined appends them to an otherwise empty destination, keeping
 * their keys.
 */
export function copyLayers(
  document: Document,
  layers: readonly Layer[],
  sceneId: string,
  parentId: string | null,
  after: string | null | undefined,
): Patch[] {
  const patches: Patch[] = [];
  const existing = childLayers(document.layers, sceneId, parentId);
  const taken = existing.map((layer) => layer.name);
  const keys =
    after === undefined
      ? layers.map((layer) => layer.order)
      : orderKeysAfter(existing, after, layers.length);
  layers.forEach((source, index) => {
    const copyId = generateId("layer");
    const name = uniqueName(taken, source.name);
    taken.push(name);
    const copy: Layer = {
      ...source,
      id: copyId,
      name,
      sceneId,
      parentId,
      order: keys?.[index] ?? source.order,
    };
    patches.push({ op: "set", path: ["layers", copyId], value: copy });
    if (source.kind === "group")
      patches.push(
        ...copyLayers(
          document,
          childLayers(document.layers, source.sceneId, source.id),
          sceneId,
          copyId,
          undefined,
        ),
      );
  });
  return patches;
}

/** A copy of the Layer, and of everything inside a Group, right after the original. */
export const layerDuplicate = defineCommand({
  name: "layer.duplicate",
  kind: "authoring",
  description: "Duplicate a Layer below itself.",
  payload: z
    .object({
      layerId: z.string().min(1),
      id: z.string().min(1).optional(),
    })
    .strict(),
  label: () => "Duplicate Layer",
  apply({ document, payload }) {
    const source = document.layers[payload.layerId];
    if (source === undefined)
      return rejected(`Layer “${payload.layerId}” does not exist.`);
    const copyId =
      payload.id === undefined ? generateId("layer") : id("layer", payload.id);
    if (copyId in document.layers)
      return rejected(`Layer “${copyId}” already exists.`);
    const siblings = childLayers(
      document.layers,
      source.sceneId,
      source.parentId,
    );
    const keys = orderKeysForMove(
      siblings,
      { id: copyId, order: "" },
      source.id,
    );
    const copy: Layer = {
      ...source,
      id: copyId,
      name: uniqueName(
        siblings.map((sibling) => sibling.name),
        source.name,
      ),
      order: keys.get(copyId) ?? source.order,
    };
    const patches: Patch[] = [
      { op: "set", path: ["layers", copyId], value: copy },
    ];
    for (const [changedId, order] of keys) {
      if (changedId === copyId) continue;
      patches.push({
        op: "set",
        path: ["layers", changedId, "order"],
        value: order,
      });
    }
    if (source.kind === "group")
      patches.push(
        ...copyLayers(
          document,
          childLayers(document.layers, source.sceneId, source.id),
          source.sceneId,
          copyId,
          undefined,
        ),
      );
    return accepted(patches);
  },
});
