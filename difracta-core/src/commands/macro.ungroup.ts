import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { treeUngroup } from "../document/tree.ts";

/** Dissolves a Macro Group: its contents take its place, in their order. */
export const macroUngroup = defineCommand({
  name: "macro.ungroup",
  kind: "authoring",
  description: "Replace a Macro Group by its contents.",
  payload: z.object({ macroId: z.string().min(1) }).strict(),
  label: () => "Ungroup",
  apply({ document, payload }) {
    const group = document.macros[payload.macroId];
    if (group === undefined)
      return rejected(`Macro “${payload.macroId}” does not exist.`);
    const patches = treeUngroup(
      { name: "macros", table: document.macros, noun: "Macro" },
      group,
    );
    return "error" in patches ? rejected(patches.error) : accepted(patches);
  },
});
