import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import {
  siblingsOf,
  tableEntries,
  type OutputMask,
} from "../document/document.ts";
import { insetPolygon } from "../document/geometry.ts";
import { uniqueName } from "../document/names.ts";
import { appendOrderKey } from "../document/order.ts";
import { generateId, id } from "../ids.ts";
import { settings } from "../settings.ts";

/**
 * A new Output Mask is an exclude rectangle over the middle of the
 * Projection Frame, with no feather, after the Output's other masks: an
 * obstruction in the beam is what one is made for, so it starts cutting.
 */
export const outputMaskCreate = defineCommand({
  name: "output-mask.create",
  kind: "authoring",
  description: "Create an Output Mask on an Output.",
  payload: z
    .object({
      id: z.string().min(1).optional(),
      outputId: z.string().min(1),
      name: z.string().trim().min(1).max(120),
    })
    .strict(),
  label: ({ name }) => `Create Output Mask “${name}”`,
  apply({ document, payload }) {
    const maskId =
      payload.id === undefined
        ? generateId("outputMask")
        : id("outputMask", payload.id);
    if (maskId in document.outputMasks)
      return rejected(`Output Mask “${maskId}” already exists.`);
    if (!(payload.outputId in document.outputs))
      return rejected(`Output “${payload.outputId}” does not exist.`);
    const draft = { id: maskId, outputId: payload.outputId };
    const siblings = siblingsOf(
      "outputMasks",
      document.outputMasks,
      draft as OutputMask,
    );
    const mask: OutputMask = {
      ...draft,
      name: uniqueName(
        tableEntries(siblings).map((sibling) => sibling.name),
        payload.name,
      ),
      mode: "exclude",
      points: insetPolygon(settings.outputMasks.defaultInset),
      feather: 0,
      order: appendOrderKey(siblings),
    };
    return accepted([
      { op: "set", path: ["outputMasks", maskId], value: mask },
    ]);
  },
});
