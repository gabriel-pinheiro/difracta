import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { LAYER_KINDS, type Layer } from "../document/document.ts";
import { childLayers, LAYER_LABELS } from "../document/layers.ts";
import { uniqueName } from "../document/names.ts";
import { generateKeyBetween } from "fractional-indexing";
import { generateId, id } from "../ids.ts";

/**
 * A new Layer lands at the top of the Scene root or Group it was added to,
 * without a Visual, Filter or Target: those are picked afterwards.
 */
export const layerCreate = defineCommand({
  name: "layer.create",
  kind: "authoring",
  description: "Add a Visual Layer, Filter Layer or Group to a Scene.",
  payload: z
    .object({
      id: z.string().min(1).optional(),
      kind: z.enum(LAYER_KINDS),
      sceneId: z.string().min(1),
      /** Group to add into; null for the Scene's root. */
      parentId: z.string().min(1).nullable().default(null),
      name: z.string().trim().min(1).max(120).optional(),
    })
    .strict(),
  label: ({ kind }) => `Add ${LAYER_LABELS[kind]}`,
  apply({ document, payload }) {
    const layerId =
      payload.id === undefined ? generateId("layer") : id("layer", payload.id);
    if (layerId in document.layers)
      return rejected(`Layer “${layerId}” already exists.`);
    if (!(payload.sceneId in document.scenes))
      return rejected(`Scene “${payload.sceneId}” does not exist.`);
    if (payload.parentId !== null) {
      const parent = document.layers[payload.parentId];
      if (parent?.kind !== "group" || parent.sceneId !== payload.sceneId)
        return rejected(
          `Group “${payload.parentId}” is not in Scene “${payload.sceneId}”.`,
        );
    }
    const siblings = childLayers(
      document.layers,
      payload.sceneId,
      payload.parentId,
    );
    const base = {
      id: layerId,
      name: uniqueName(
        siblings.map((sibling) => sibling.name),
        payload.name ?? LAYER_LABELS[payload.kind],
      ),
      sceneId: payload.sceneId,
      parentId: payload.parentId,
      enabled: true,
      order: generateKeyBetween(null, siblings[0]?.order ?? null),
    };
    const layer: Layer =
      payload.kind === "visual"
        ? {
            ...base,
            kind: "visual",
            visual: null,
            target: null,
            opacity: 1,
            blendMode: "normal",
          }
        : payload.kind === "filter"
          ? { ...base, kind: "filter", filter: null, mix: 1 }
          : { ...base, kind: "group" };
    return accepted([{ op: "set", path: ["layers", layerId], value: layer }]);
  },
});
