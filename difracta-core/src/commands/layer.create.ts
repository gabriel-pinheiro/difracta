import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import {
  LAYER_KINDS,
  type Document,
  type Layer,
} from "../document/document.ts";
import { childLayers, LAYER_LABELS } from "../document/layers.ts";
import { uniqueName } from "../document/names.ts";
import { orderedEntries } from "../document/order.ts";
import { orderKeyForNew } from "../document/tree.ts";
import { generateId, id } from "../ids.ts";

/** The neighbour's Target when it has one, else the first Surface, else none. */
function defaultTarget(
  document: Document,
  siblings: readonly Layer[],
  after: string | null,
): string | null {
  const neighbour =
    after === null
      ? siblings[0]
      : siblings.find((sibling) => sibling.id === after);
  if (neighbour?.kind === "visual" && neighbour.target !== null)
    return neighbour.target;
  return orderedEntries(document.surfaces)[0]?.id ?? null;
}

/**
 * A new Layer lands at the top of the Scene root or Group it was added to,
 * or right below the sibling `after` names, without a Visual or Filter: those
 * are picked afterwards. A Visual Layer gets a Target unless the payload names
 * one or null: the Target of the sibling it lands next to (the current top, or
 * the `after` sibling) when that is a Visual Layer with one, otherwise the
 * first Surface in order, otherwise none.
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
      /** Sibling to land below; null or absent for the top. */
      after: z.string().min(1).nullable().optional(),
      /**
       * Visual Layers only: Surface to render onto; null for none. Omitted
       * picks the neighbouring sibling's Target, else the first Surface.
       */
      target: z.string().min(1).nullable().optional(),
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
    if (payload.target !== undefined && payload.target !== null) {
      if (payload.kind !== "visual")
        return rejected("Only a Visual Layer has a Target.");
      if (!(payload.target in document.surfaces))
        return rejected(`Surface “${payload.target}” does not exist.`);
    }
    const order = orderKeyForNew(siblings, payload.after ?? null, "Layer");
    if (typeof order !== "string") return rejected(order.error);
    const base = {
      id: layerId,
      name: uniqueName(
        siblings.map((sibling) => sibling.name),
        payload.name ?? LAYER_LABELS[payload.kind],
      ),
      sceneId: payload.sceneId,
      parentId: payload.parentId,
      enabled: true,
      order,
    };
    const layer: Layer =
      payload.kind === "visual"
        ? {
            ...base,
            kind: "visual",
            visual: null,
            parameters: {},
            target:
              payload.target === undefined
                ? defaultTarget(document, siblings, payload.after ?? null)
                : payload.target,
            paths: {},
            opacity: 1,
            blendMode: "normal",
          }
        : payload.kind === "filter"
          ? { ...base, kind: "filter", filter: null, parameters: {}, mix: 1 }
          : { ...base, kind: "group" };
    return accepted([{ op: "set", path: ["layers", layerId], value: layer }]);
  },
});
