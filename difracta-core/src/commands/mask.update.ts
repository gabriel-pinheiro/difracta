import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import type { Patch } from "../document/patch.ts";

/** Mode and feather of a Mask; each field optional so one call can change any subset. */
export const maskUpdate = defineCommand({
  name: "mask.update",
  kind: "authoring",
  description: "Change a Mask's mode or feather.",
  payload: z
    .object({
      maskId: z.string().min(1),
      mode: z.enum(["include", "exclude"]).optional(),
      /** Fraction of Surface Space the edge fades over, inward only. */
      feather: z.number().min(0).max(1).optional(),
    })
    .strict(),
  label: () => "Change Mask settings",
  coalesceKey: ({ maskId }) => `mask.update:${maskId}`,
  apply({ document, payload }) {
    const mask = document.masks[payload.maskId];
    if (mask === undefined)
      return rejected(`Mask “${payload.maskId}” does not exist.`);
    const patches: Patch[] = [];
    if (payload.mode !== undefined && payload.mode !== mask.mode) {
      patches.push({
        op: "set",
        path: ["masks", mask.id, "mode"],
        value: payload.mode,
      });
    }
    if (payload.feather !== undefined && payload.feather !== mask.feather) {
      patches.push({
        op: "set",
        path: ["masks", mask.id, "feather"],
        value: payload.feather,
      });
    }
    return accepted(patches);
  },
});
