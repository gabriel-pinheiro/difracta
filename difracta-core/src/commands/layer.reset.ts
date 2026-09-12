import { z } from "zod";

import { linksOfLayer } from "../address/links.ts";
import {
  defaultParameterValues,
  type ParameterValue,
} from "../catalog/parameters.ts";
import { accepted, defineCommand, rejected } from "../command/command.ts";

/** Every unlinked Parameter of a Layer back to its definition's default, as one step. */
export const layerReset = defineCommand({
  name: "layer.reset",
  kind: "authoring",
  description: "Reset every Parameter of a Layer to its default.",
  payload: z.object({ layerId: z.string().min(1) }).strict(),
  label: () => "Reset Parameters",
  apply({ document, payload, catalog }) {
    const layer = document.layers[payload.layerId];
    if (layer === undefined)
      return rejected(`Layer “${payload.layerId}” does not exist.`);
    if (layer.kind === "group") return rejected("A Group has no Parameters.");
    const id = layer.kind === "visual" ? layer.visual : layer.filter;
    const definition =
      id === null ? undefined : catalog.definition(layer.kind, id);
    if (definition === undefined)
      return rejected("The Layer has no Parameters to reset.");
    const defaults: Record<string, ParameterValue> = {
      ...defaultParameterValues(definition.parameters),
    };
    for (const link of linksOfLayer(document.links, layer.id)) {
      const name = link.address.split("/")[3];
      const authored = name === undefined ? undefined : layer.parameters[name];
      if (name !== undefined && authored !== undefined)
        defaults[name] = authored;
    }
    return accepted([
      {
        op: "set",
        path: ["layers", layer.id, "parameters"],
        value: defaults,
      },
    ]);
  },
});
