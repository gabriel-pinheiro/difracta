import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { MaskModeSchema } from "../document/document.ts";
import type { Patch } from "../document/patch.ts";

/** Mode and feather of an Output Mask; each field optional so one call can change any subset. */
export const outputMaskUpdate = defineCommand({
  name: "output-mask.update",
  kind: "authoring",
  description: "Change an Output Mask's mode or feather.",
  payload: z
    .object({
      outputMaskId: z.string().min(1),
      mode: MaskModeSchema.optional(),
      /** Fraction of the frame's mean side the edge fades over, on the dark side. */
      feather: z.number().min(0).max(1).optional(),
    })
    .strict(),
  label: () => "Change Output Mask settings",
  coalesceKey: ({ outputMaskId }) => `output-mask.update:${outputMaskId}`,
  apply({ document, payload }) {
    const mask = document.outputMasks[payload.outputMaskId];
    if (mask === undefined)
      return rejected(`Output Mask “${payload.outputMaskId}” does not exist.`);
    const patches: Patch[] = [];
    if (payload.mode !== undefined && payload.mode !== mask.mode) {
      patches.push({
        op: "set",
        path: ["outputMasks", mask.id, "mode"],
        value: payload.mode,
      });
    }
    if (payload.feather !== undefined && payload.feather !== mask.feather) {
      patches.push({
        op: "set",
        path: ["outputMasks", mask.id, "feather"],
        value: payload.feather,
      });
    }
    return accepted(patches);
  },
});
