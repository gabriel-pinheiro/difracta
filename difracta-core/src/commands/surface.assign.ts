import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { FULL_FRAME } from "../document/geometry.ts";
import type { Patch } from "../document/patch.ts";

/**
 * Chooses the Output a Surface renders through. A mapping the Surface already
 * holds for that Output is reused, so moving a Surface back to a projector
 * restores its calibration; otherwise a fresh default mapping is created.
 */
export const surfaceAssign = defineCommand({
  name: "surface.assign",
  kind: "authoring",
  description: "Assign a Surface to an Output, or to none.",
  payload: z
    .object({
      surfaceId: z.string().min(1),
      output: z.string().min(1).nullable(),
    })
    .strict(),
  label: ({ output }) =>
    output === null ? "Unassign Surface" : "Assign Surface to Output",
  apply({ document, payload }) {
    const surface = document.surfaces[payload.surfaceId];
    if (surface === undefined)
      return rejected(`Surface “${payload.surfaceId}” does not exist.`);
    const output = payload.output;
    if (output !== null && !(output in document.outputs))
      return rejected(`Output “${output}” does not exist.`);
    if (surface.output === output) return accepted([]);
    const patches: Patch[] = [];
    if (output !== null && !(output in surface.mappings)) {
      patches.push({
        op: "set",
        path: ["surfaces", surface.id, "mappings", output],
        value: { corners: FULL_FRAME },
      });
    }
    patches.push({
      op: "set",
      path: ["surfaces", surface.id, "output"],
      value: output,
    });
    return accepted(patches);
  },
});
