import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { childLayers, descendantLayers } from "../document/layers.ts";
import { orderKeysForMove } from "../document/order.ts";
import type { Patch } from "../document/patch.ts";

/**
 * Places a Layer after a sibling (or first) under any Scene root or Group,
 * in its own Scene or another. A Group carries its contents along; it
 * cannot be moved into itself or its descendants.
 */
export const layerMove = defineCommand({
  name: "layer.move",
  kind: "authoring",
  description: "Move a Layer within or across Scenes and Groups.",
  payload: z
    .object({
      layerId: z.string().min(1),
      sceneId: z.string().min(1),
      parentId: z.string().min(1).nullable(),
      /** Sibling to land after in the destination; null for the top. */
      after: z.string().min(1).nullable(),
    })
    .strict(),
  label: () => "Move Layer",
  coalesceKey: ({ layerId }) => `layer.move:${layerId}`,
  apply({ document, payload }) {
    const layer = document.layers[payload.layerId];
    if (layer === undefined)
      return rejected(`Layer “${payload.layerId}” does not exist.`);
    if (!(payload.sceneId in document.scenes))
      return rejected(`Scene “${payload.sceneId}” does not exist.`);
    if (payload.parentId !== null) {
      const parent = document.layers[payload.parentId];
      if (parent?.kind !== "group" || parent.sceneId !== payload.sceneId)
        return rejected(
          `Group “${payload.parentId}” is not in Scene “${payload.sceneId}”.`,
        );
      const descendants = descendantLayers(document.layers, layer.id);
      if (
        payload.parentId === layer.id ||
        descendants.some((child) => child.id === payload.parentId)
      )
        return rejected("A Group cannot be moved into itself.");
    }
    if (payload.after === layer.id)
      return rejected("A Layer cannot be placed after itself.");
    const siblings = childLayers(
      document.layers,
      payload.sceneId,
      payload.parentId,
    ).filter((sibling) => sibling.id !== layer.id);
    if (payload.after !== null && !siblings.some((s) => s.id === payload.after))
      return rejected(`Layer “${payload.after}” is not in the destination.`);
    const patches: Patch[] = [];
    if (layer.sceneId !== payload.sceneId) {
      for (const child of descendantLayers(document.layers, layer.id))
        patches.push({
          op: "set",
          path: ["layers", child.id, "sceneId"],
          value: payload.sceneId,
        });
      patches.push({
        op: "set",
        path: ["layers", layer.id, "sceneId"],
        value: payload.sceneId,
      });
    }
    if (layer.parentId !== payload.parentId)
      patches.push({
        op: "set",
        path: ["layers", layer.id, "parentId"],
        value: payload.parentId,
      });
    const moving =
      layer.sceneId === payload.sceneId && layer.parentId === payload.parentId
        ? layer
        : // Arriving from elsewhere: its old key means nothing here.
          { id: layer.id, order: "" };
    for (const [changedId, order] of orderKeysForMove(
      siblings,
      moving,
      payload.after,
    ))
      patches.push({
        op: "set",
        path: ["layers", changedId, "order"],
        value: order,
      });
    return accepted(patches);
  },
});
