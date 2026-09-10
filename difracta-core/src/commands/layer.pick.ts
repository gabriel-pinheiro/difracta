import { z } from "zod";

import type { Definition } from "../catalog/catalog.ts";
import {
  defaultParameterValues,
  ParameterValuesSchema,
  validateParameterValues,
  type ParameterValues,
} from "../catalog/parameters.ts";
import {
  accepted,
  defineCommand,
  rejected,
  type CommandContext,
  type CommandOutcome,
} from "../command/command.ts";
import type { FilterLayer, VisualLayer } from "../document/document.ts";
import { childLayers, LAYER_LABELS } from "../document/layers.ts";
import { uniqueName } from "../document/names.ts";
import type { Patch } from "../document/patch.ts";

/**
 * Picking what a Layer is made of: `layer.visual` sets a Visual Layer's
 * Visual, `layer.filter` a Filter Layer's Filter. The Parameters take the
 * definition's defaults unless a complete set of values comes along, which
 * is how a pick is put back. Both coalesce per Layer, so browsing through
 * candidates undoes as one step.
 *
 * A Layer still called by its generated name, or by the name of what it
 * held before, takes the new definition's name, and the generated name again
 * when left with nothing; a name the user typed stays.
 */
const PickPayload = z
  .object({
    layerId: z.string().min(1),
    parameters: ParameterValuesSchema.optional(),
  })
  .strict();

const numbered = (base: string): RegExp =>
  new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( \\d+)?$`, "i");

function pick(
  { document, catalog }: CommandContext<unknown>,
  layer: VisualLayer | FilterLayer,
  field: "visual" | "filter",
  nextId: string | null,
  values: ParameterValues | undefined,
): CommandOutcome {
  const label = field === "visual" ? "Visual" : "Filter";
  const currentId = layer.kind === "visual" ? layer.visual : layer.filter;
  const next: Definition | undefined =
    nextId === null ? undefined : catalog.definition(field, nextId);
  if (nextId !== null && next === undefined)
    return rejected(`${label} “${nextId}” is not in the Catalog.`);
  if (nextId === currentId && values === undefined) return accepted([]);

  const parameters: ParameterValues =
    values ??
    (next === undefined ? {} : defaultParameterValues(next.parameters));
  if (next !== undefined) {
    const problem = validateParameterValues(next.parameters, parameters);
    if (problem !== undefined) return rejected(problem);
  } else if (Object.keys(parameters).length > 0) {
    return rejected(`A Layer without a ${label} has no Parameters.`);
  }

  const patches: Patch[] = [
    { op: "set", path: ["layers", layer.id, field], value: nextId },
    { op: "set", path: ["layers", layer.id, "parameters"], value: parameters },
  ];
  const previous =
    currentId === null ? undefined : catalog.definition(field, currentId);
  const generated = [LAYER_LABELS[layer.kind], previous?.name]
    .filter((base): base is string => base !== undefined)
    .some((base) => numbered(base).test(layer.name));
  if (generated) {
    const taken = childLayers(document.layers, layer.sceneId, layer.parentId)
      .filter((sibling) => sibling.id !== layer.id)
      .map((sibling) => sibling.name);
    const name = uniqueName(taken, next?.name ?? LAYER_LABELS[layer.kind]);
    if (name !== layer.name)
      patches.push({
        op: "set",
        path: ["layers", layer.id, "name"],
        value: name,
      });
  }
  return accepted(patches);
}

export const layerVisual = defineCommand({
  name: "layer.visual",
  kind: "authoring",
  description:
    "Give a Visual Layer a Visual from the Catalog, with default Parameters unless values are given.",
  payload: PickPayload.extend({
    /** Visual id, or null to leave the Layer without one. */
    visual: z.string().min(1).nullable(),
  }).strict(),
  label: () => "Change Visual",
  coalesceKey: ({ layerId }) => `layer.visual:${layerId}`,
  apply(context) {
    const { document, payload } = context;
    const layer = document.layers[payload.layerId];
    if (layer === undefined)
      return rejected(`Layer “${payload.layerId}” does not exist.`);
    if (layer.kind !== "visual")
      return rejected("Only Visual Layers have a Visual.");
    return pick(context, layer, "visual", payload.visual, payload.parameters);
  },
});

export const layerFilter = defineCommand({
  name: "layer.filter",
  kind: "authoring",
  description:
    "Give a Filter Layer a Filter from the Catalog, with default Parameters unless values are given.",
  payload: PickPayload.extend({
    /** Filter id, or null to leave the Layer without one. */
    filter: z.string().min(1).nullable(),
  }).strict(),
  label: () => "Change Filter",
  coalesceKey: ({ layerId }) => `layer.filter:${layerId}`,
  apply(context) {
    const { document, payload } = context;
    const layer = document.layers[payload.layerId];
    if (layer === undefined)
      return rejected(`Layer “${payload.layerId}” does not exist.`);
    if (layer.kind !== "filter")
      return rejected("Only Filter Layers have a Filter.");
    return pick(context, layer, "filter", payload.filter, payload.parameters);
  },
});
