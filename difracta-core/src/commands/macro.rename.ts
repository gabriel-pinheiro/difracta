import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { treeRename } from "../document/tree.ts";

export const macroRename = defineCommand({
  name: "macro.rename",
  kind: "authoring",
  description: "Rename a Macro.",
  payload: z
    .object({
      macroId: z.string().min(1),
      name: z.string().trim().min(1).max(120),
    })
    .strict(),
  label: () => "Rename Macro",
  coalesceKey: ({ macroId }) => `macro.rename:${macroId}`,
  apply({ document, payload }) {
    const macro = document.macros[payload.macroId];
    if (macro === undefined)
      return rejected(`Macro “${payload.macroId}” does not exist.`);
    const patches = treeRename(
      { name: "macros", table: document.macros, noun: "Macro" },
      macro,
      payload.name,
    );
    return "error" in patches ? rejected(patches.error) : accepted(patches);
  },
});
