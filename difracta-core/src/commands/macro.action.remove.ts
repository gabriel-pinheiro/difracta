import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";

export const macroActionRemove = defineCommand({
  name: "macro.action.remove",
  kind: "authoring",
  description: "Remove one action from a Macro.",
  payload: z
    .object({ macroId: z.string().min(1), actionId: z.string().min(1) })
    .strict(),
  label: () => "Remove Action",
  apply({ document, payload }) {
    const macro = document.macros[payload.macroId];
    if (macro?.kind !== "macro")
      return rejected(`“${payload.macroId}” is not a Macro.`);
    const actions = macro.actions.filter(
      (action) => action.id !== payload.actionId,
    );
    if (actions.length === macro.actions.length)
      return rejected(`Action “${payload.actionId}” is not in the Macro.`);
    return accepted([
      { op: "set", path: ["macros", macro.id, "actions"], value: actions },
    ]);
  },
});
