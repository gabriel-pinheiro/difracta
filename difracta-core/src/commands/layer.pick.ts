import { z } from "zod";

import type { Definition } from "../catalog/catalog.ts";
import {
  defaultParameterValues,
  ParameterValuesSchema,
  catalogHint,
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
import { linkable } from "../address/address.ts";
import { actionProblem } from "../address/fire.ts";
import { linksOfLayer } from "../address/links.ts";
import { dropActions } from "../document/macros.ts";
import type { FilterLayer, VisualLayer } from "../document/document.ts";
import { childLayers, LAYER_LABELS } from "../document/layers.ts";
import { uniqueName } from "../document/names.ts";
import { mediaValueProblem } from "../document/media.ts";
import { applyPatches, type Patch } from "../document/patch.ts";
import { fitPaths } from "../document/paths.ts";

/**
 * Picking what a Layer is made of: `layer.visual` sets a Visual Layer's
 * Visual, `layer.filter` a Filter Layer's Filter. The Parameters take the
 * definition's defaults unless a complete set of values comes along, which
 * is how a pick is put back. Both coalesce per Layer, so browsing through
 * candidates undoes as one step.
 *
 * A Layer still called by its generated name, or by the name of what it
 * held before, takes the new definition's name, and the generated name again
 * when left with nothing; a name the user typed stays. Links to Parameters
 * the new definition lacks, or of another type, go; the rest stay wired,
 * and so do Path bindings under keys the new Visual declares.
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

  // Given values sit over the definition's defaults, so a caller names
  // only what differs.
  const parameters: ParameterValues =
    next === undefined
      ? (values ?? {})
      : { ...defaultParameterValues(next.parameters), ...values };
  if (next !== undefined) {
    const problem =
      validateParameterValues(next.parameters, parameters) ??
      mediaValuesProblem(document, next, parameters);
    if (problem !== undefined)
      return rejected(`${problem} ${catalogHint(next.id)}`);
  } else if (Object.keys(parameters).length > 0) {
    return rejected(`A Layer without a ${label} has no Parameters.`);
  }

  const patches: Patch[] = [
    { op: "set", path: ["layers", layer.id, field], value: nextId },
    { op: "set", path: ["layers", layer.id, "parameters"], value: parameters },
  ];
  if (layer.kind === "visual") {
    const paths = fitPaths(
      document,
      catalog,
      nextId,
      layer.target,
      layer.paths,
    );
    if (Object.keys(paths).length !== Object.keys(layer.paths).length)
      patches.push({
        op: "set",
        path: ["layers", layer.id, "paths"],
        value: paths,
      });
  }
  for (const link of linksOfLayer(document.links, layer.id)) {
    const [, , kind, name] = link.address.split("/");
    if (kind !== "param") continue;
    const parameter = next?.parameters[name ?? ""];
    const controller = document.controllers[link.controllerId];
    const keep =
      parameter !== undefined &&
      controller !== undefined &&
      controller.kind !== "group" &&
      linkable(
        {
          address: link.address,
          label: parameter.label,
          path: ["layers", layer.id, "parameters", name ?? ""],
          type: parameter.kind,
        },
        controller.kind,
      );
    if (!keep) patches.push({ op: "remove", path: ["links", link.id] });
  }
  // Macro actions on Parameters or Cues the new definition lacks go too.
  const swapped = applyPatches(document, patches);
  patches.push(
    ...dropActions(
      document,
      (action) =>
        !action.address.startsWith(`layer/${layer.id}/`) ||
        actionProblem(swapped, catalog, action) === undefined ||
        actionProblem(swapped, catalog, action)?.includes(
          "is controlled by",
        ) === true,
    ),
  );
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

/** A media Parameter's value must be an existing item of the kind it accepts; the schema alone cannot tell. */
function mediaValuesProblem(
  document: CommandContext<unknown>["document"],
  definition: Definition,
  values: ParameterValues,
): string | undefined {
  for (const [name, parameter] of Object.entries(definition.parameters)) {
    if (parameter.kind !== "media") continue;
    const problem = mediaValueProblem(
      document,
      parameter.accepts,
      values[name],
    );
    if (problem !== undefined) return `Parameter “${name}” ${problem}.`;
  }
  return undefined;
}

export const layerVisual = defineCommand({
  name: "layer.visual",
  kind: "authoring",
  description:
    "Give a Visual Layer a Visual from the Catalog, with the Catalog defaults for every Parameter not given.",
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
    "Give a Filter Layer a Filter from the Catalog, with the Catalog defaults for every Parameter not given.",
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
