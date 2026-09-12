import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { treeMove } from "../document/tree.ts";

/** Places a Macro after a sibling (or first) at the root or in a Group; a Group carries its contents. */
export const macroMove = defineCommand({
  name: "macro.move",
  kind: "authoring",
  description: "Move a Macro within or across Groups.",
  payload: z
    .object({
      macroId: z.string().min(1),
      parentId: z.string().min(1).nullable(),
      /** Sibling to land after in the destination; null for the top. */
      after: z.string().min(1).nullable(),
    })
    .strict(),
  label: () => "Move Macro",
  coalesceKey: ({ macroId }) => `macro.move:${macroId}`,
  apply({ document, payload }) {
    const macro = document.macros[payload.macroId];
    if (macro === undefined)
      return rejected(`Macro “${payload.macroId}” does not exist.`);
    const patches = treeMove(
      { name: "macros", table: document.macros, noun: "Macro" },
      macro,
      payload.parentId,
      payload.after,
    );
    return "error" in patches ? rejected(patches.error) : accepted(patches);
  },
});
