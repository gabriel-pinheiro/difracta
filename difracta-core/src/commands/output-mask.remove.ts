import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";

export const outputMaskRemove = defineCommand({
  name: "output-mask.remove",
  kind: "authoring",
  description: "Remove an Output Mask.",
  payload: z.object({ outputMaskId: z.string().min(1) }).strict(),
  label: () => "Remove Output Mask",
  apply({ document, payload }) {
    if (!(payload.outputMaskId in document.outputMasks))
      return rejected(`Output Mask “${payload.outputMaskId}” does not exist.`);
    return accepted([
      { op: "remove", path: ["outputMasks", payload.outputMaskId] },
    ]);
  },
});
