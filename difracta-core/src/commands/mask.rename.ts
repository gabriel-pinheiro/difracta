import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { siblingsOf, tableEntries } from "../document/document.ts";
import { uniqueName } from "../document/names.ts";

export const maskRename = defineCommand({
  name: "mask.rename",
  kind: "authoring",
  description: "Rename a Mask.",
  payload: z
    .object({
      maskId: z.string().min(1),
      name: z.string().trim().min(1).max(120),
    })
    .strict(),
  label: () => "Rename Mask",
  coalesceKey: ({ maskId }) => `mask.rename:${maskId}`,
  apply({ document, payload }) {
    const mask = document.masks[payload.maskId];
    if (mask === undefined)
      return rejected(`Mask “${payload.maskId}” does not exist.`);
    const name = uniqueName(
      tableEntries(siblingsOf("masks", document.masks, mask))
        .filter((sibling) => sibling.id !== mask.id)
        .map((sibling) => sibling.name),
      payload.name,
    );
    if (mask.name === name) return accepted([]);
    return accepted([
      { op: "set", path: ["masks", mask.id, "name"], value: name },
    ]);
  },
});
