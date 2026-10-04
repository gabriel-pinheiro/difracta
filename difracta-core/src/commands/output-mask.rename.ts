import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { siblingsOf, tableEntries } from "../document/document.ts";
import { uniqueName } from "../document/names.ts";

export const outputMaskRename = defineCommand({
  name: "output-mask.rename",
  kind: "authoring",
  description: "Rename an Output Mask.",
  payload: z
    .object({
      outputMaskId: z.string().min(1),
      name: z.string().trim().min(1).max(120),
    })
    .strict(),
  label: () => "Rename Output Mask",
  coalesceKey: ({ outputMaskId }) => `output-mask.rename:${outputMaskId}`,
  apply({ document, payload }) {
    const mask = document.outputMasks[payload.outputMaskId];
    if (mask === undefined)
      return rejected(`Output Mask “${payload.outputMaskId}” does not exist.`);
    const name = uniqueName(
      tableEntries(siblingsOf("outputMasks", document.outputMasks, mask))
        .filter((sibling) => sibling.id !== mask.id)
        .map((sibling) => sibling.name),
      payload.name,
    );
    if (mask.name === name) return accepted([]);
    return accepted([
      { op: "set", path: ["outputMasks", mask.id, "name"], value: name },
    ]);
  },
});
