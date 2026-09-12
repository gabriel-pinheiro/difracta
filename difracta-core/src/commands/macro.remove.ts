import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { descendantMacros, dropActionsUnder } from "../document/macros.ts";
import type { Patch } from "../document/patch.ts";

/** Removing a Macro drops the actions of other Macros that ran it; a Group goes with its contents. */
export const macroRemove = defineCommand({
  name: "macro.remove",
  kind: "authoring",
  description: "Remove a Macro, or a Group with its contents.",
  payload: z.object({ macroId: z.string().min(1) }).strict(),
  label: () => "Remove Macro",
  apply({ document, payload }) {
    const macro = document.macros[payload.macroId];
    if (macro === undefined)
      return rejected(`Macro “${payload.macroId}” does not exist.`);
    const removed: string[] = [
      macro.id,
      ...descendantMacros(document.macros, macro.id).map((child) => child.id),
    ];
    const patches: Patch[] = dropActionsUnder(
      document,
      removed.map((id) => `macro/${id}/`),
    ).filter((patch) => !removed.includes(String(patch.path[1])));
    for (const id of removed)
      patches.push({ op: "remove", path: ["macros", id] });
    return accepted(patches);
  },
});
