import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";

/** Reorders one action within its Macro: after another action, or first. */
export const macroActionMove = defineCommand({
  name: "macro.action.move",
  kind: "authoring",
  description: "Move an action within its Macro.",
  payload: z
    .object({
      macroId: z.string().min(1),
      actionId: z.string().min(1),
      /** Action to land after; null for the top. */
      after: z.string().min(1).nullable(),
    })
    .strict(),
  label: () => "Move Action",
  coalesceKey: ({ actionId }) => `macro.action.move:${actionId}`,
  apply({ document, payload }) {
    const macro = document.macros[payload.macroId];
    if (macro?.kind !== "macro")
      return rejected(`“${payload.macroId}” is not a Macro.`);
    const moving = macro.actions.find(
      (action) => action.id === payload.actionId,
    );
    if (moving === undefined)
      return rejected(`Action “${payload.actionId}” is not in the Macro.`);
    if (payload.after === moving.id)
      return rejected("An action cannot be placed after itself.");
    const others = macro.actions.filter((action) => action.id !== moving.id);
    const at =
      payload.after === null
        ? 0
        : others.findIndex((action) => action.id === payload.after) + 1;
    if (at === 0 && payload.after !== null)
      return rejected(`Action “${payload.after}” is not in the Macro.`);
    const actions = [...others.slice(0, at), moving, ...others.slice(at)];
    if (actions.every((action, index) => action === macro.actions[index]))
      return accepted([]);
    return accepted([
      { op: "set", path: ["macros", macro.id, "actions"], value: actions },
    ]);
  },
});
