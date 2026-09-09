import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import type { Layer } from "../document/document.ts";
import { childLayers, LAYER_LABELS } from "../document/layers.ts";
import { uniqueName } from "../document/names.ts";
import { DEFAULT_ORDER_KEY, orderKeysAfter } from "../document/order.ts";
import type { Patch } from "../document/patch.ts";
import { generateId, id } from "../ids.ts";

/** Wraps a Layer in a new Group that takes the Layer's place. */
export const layerGroup = defineCommand({
  name: "layer.group",
  kind: "authoring",
  description: "Put a Layer in a new Group at its position.",
  payload: z
    .object({
      layerId: z.string().min(1),
      id: z.string().min(1).optional(),
    })
    .strict(),
  label: () => "Group Layer",
  apply({ document, payload }) {
    const layer = document.layers[payload.layerId];
    if (layer === undefined)
      return rejected(`Layer “${payload.layerId}” does not exist.`);
    const groupId =
      payload.id === undefined ? generateId("layer") : id("layer", payload.id);
    if (groupId in document.layers)
      return rejected(`Layer “${groupId}” already exists.`);
    const siblings = childLayers(
      document.layers,
      layer.sceneId,
      layer.parentId,
    );
    const group: Layer = {
      id: groupId,
      kind: "group",
      name: uniqueName(
        siblings
          .filter((sibling) => sibling.id !== layer.id)
          .map((sibling) => sibling.name),
        LAYER_LABELS.group,
      ),
      sceneId: layer.sceneId,
      parentId: layer.parentId,
      enabled: true,
      order: layer.order,
    };
    return accepted([
      { op: "set", path: ["layers", groupId], value: group },
      { op: "set", path: ["layers", layer.id, "parentId"], value: groupId },
      {
        op: "set",
        path: ["layers", layer.id, "order"],
        value: DEFAULT_ORDER_KEY,
      },
    ]);
  },
});

/** Dissolves a Group: its contents take its place, in their order. */
export const layerUngroup = defineCommand({
  name: "layer.ungroup",
  kind: "authoring",
  description: "Replace a Group by its contents.",
  payload: z.object({ layerId: z.string().min(1) }).strict(),
  label: () => "Ungroup",
  apply({ document, payload }) {
    const group = document.layers[payload.layerId];
    if (group?.kind !== "group")
      return rejected(`“${payload.layerId}” is not a Group.`);
    const children = childLayers(document.layers, group.sceneId, group.id);
    const siblings = childLayers(
      document.layers,
      group.sceneId,
      group.parentId,
    );
    const index = siblings.findIndex((sibling) => sibling.id === group.id);
    const after = index <= 0 ? null : (siblings[index - 1]?.id ?? null);
    const keys = orderKeysAfter(
      siblings.filter((sibling) => sibling.id !== group.id),
      after,
      children.length,
    );
    if (keys === undefined)
      return rejected(
        "The neighbours' order keys leave no room; move them first.",
      );
    const taken = siblings
      .filter((sibling) => sibling.id !== group.id)
      .map((sibling) => sibling.name);
    const patches: Patch[] = [];
    children.forEach((child, position) => {
      const name = uniqueName(taken, child.name);
      taken.push(name);
      patches.push(
        {
          op: "set",
          path: ["layers", child.id, "parentId"],
          value: group.parentId,
        },
        {
          op: "set",
          path: ["layers", child.id, "order"],
          value: keys[position] ?? child.order,
        },
      );
      if (name !== child.name)
        patches.push({
          op: "set",
          path: ["layers", child.id, "name"],
          value: name,
        });
    });
    patches.push({ op: "remove", path: ["layers", group.id] });
    return accepted(patches);
  },
});
