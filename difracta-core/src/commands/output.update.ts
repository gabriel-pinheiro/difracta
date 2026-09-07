import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import type { Patch } from "../document/patch.ts";

/** Settings of an Output other than its name; each field is optional so one call can change any subset. */
export const outputUpdate = defineCommand({
  name: "output.update",
  kind: "authoring",
  description: "Change an Output's settings.",
  payload: z
    .object({
      outputId: z.string().min(1),
      limitPixelRatio: z.boolean().optional(),
    })
    .strict(),
  label: () => "Change Output settings",
  coalesceKey: ({ outputId }) => `output.update:${outputId}`,
  apply({ document, payload }) {
    const output = document.outputs[payload.outputId];
    if (output === undefined)
      return rejected(`Output “${payload.outputId}” does not exist.`);
    const patches: Patch[] = [];
    if (
      payload.limitPixelRatio !== undefined &&
      payload.limitPixelRatio !== output.limitPixelRatio
    ) {
      patches.push({
        op: "set",
        path: ["outputs", output.id, "limitPixelRatio"],
        value: payload.limitPixelRatio,
      });
    }
    return accepted(patches);
  },
});
