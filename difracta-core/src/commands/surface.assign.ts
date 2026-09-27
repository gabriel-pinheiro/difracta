import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { FULL_FRAME } from "../document/geometry.ts";
import type { Patch } from "../document/patch.ts";

/**
 * Puts a Surface on Outputs or takes it off them, any number at once so
 * "every table" is one undo step. A mapping the Surface already holds for an
 * Output keeps its corners either way, so putting a Surface back on a
 * projector restores its calibration; an Output it was never on gets a
 * mapping covering the whole frame.
 */
export const surfaceAssign = defineCommand({
  name: "surface.assign",
  kind: "authoring",
  description:
    "Put a Surface on one or more Outputs, each with its own mapping, or take it off them (enabled: false).",
  payload: z
    .object({
      surfaceId: z.string().min(1),
      outputs: z.array(z.string().min(1)).min(1),
      enabled: z.boolean().default(true),
    })
    .strict(),
  label: ({ outputs, enabled }) =>
    `${enabled ? "Assign Surface to" : "Unassign Surface from"} ${
      outputs.length === 1 ? "Output" : "Outputs"
    }`,
  apply({ document, payload }) {
    const surface = document.surfaces[payload.surfaceId];
    if (surface === undefined)
      return rejected(`Surface “${payload.surfaceId}” does not exist.`);
    const patches: Patch[] = [];
    for (const output of new Set(payload.outputs)) {
      if (!(output in document.outputs))
        return rejected(`Output “${output}” does not exist.`);
      const mapping = surface.mappings[output];
      if (mapping === undefined) {
        if (payload.enabled)
          patches.push({
            op: "set",
            path: ["surfaces", surface.id, "mappings", output],
            value: { enabled: true, corners: FULL_FRAME },
          });
      } else if (mapping.enabled !== payload.enabled) {
        patches.push({
          op: "set",
          path: ["surfaces", surface.id, "mappings", output, "enabled"],
          value: payload.enabled,
        });
      }
    }
    return accepted(patches);
  },
});
