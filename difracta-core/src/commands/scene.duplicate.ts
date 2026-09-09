import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { tableEntries, type Scene } from "../document/document.ts";
import { uniqueName } from "../document/names.ts";
import { orderedEntries, orderKeysForMove } from "../document/order.ts";
import type { Patch } from "../document/patch.ts";
import { generateId, id } from "../ids.ts";
import { copyLayers } from "./layer.duplicate.ts";

/** A copy of the Scene with every Layer, placed right after the original. */
export const sceneDuplicate = defineCommand({
  name: "scene.duplicate",
  kind: "authoring",
  description: "Duplicate a Scene with all its Layers.",
  payload: z
    .object({
      sceneId: z.string().min(1),
      id: z.string().min(1).optional(),
    })
    .strict(),
  label: () => "Duplicate Scene",
  apply({ document, payload }) {
    const source = document.scenes[payload.sceneId];
    if (source === undefined)
      return rejected(`Scene “${payload.sceneId}” does not exist.`);
    const sceneId =
      payload.id === undefined ? generateId("scene") : id("scene", payload.id);
    if (sceneId in document.scenes)
      return rejected(`Scene “${sceneId}” already exists.`);
    const others = orderedEntries(document.scenes);
    const keys = orderKeysForMove(
      others,
      { id: sceneId, order: "" },
      source.id,
    );
    const scene: Scene = {
      id: sceneId,
      name: uniqueName(
        others.map((scene) => scene.name),
        source.name,
      ),
      order: keys.get(sceneId) ?? source.order,
    };
    const patches: Patch[] = [
      { op: "set", path: ["scenes", sceneId], value: scene },
    ];
    for (const [changedId, order] of keys) {
      if (changedId === sceneId) continue;
      patches.push({
        op: "set",
        path: ["scenes", changedId, "order"],
        value: order,
      });
    }
    const layers = tableEntries(document.layers).filter(
      (layer) => layer.sceneId === source.id && layer.parentId === null,
    );
    patches.push(...copyLayers(document, layers, sceneId, null, undefined));
    return accepted(patches);
  },
});
