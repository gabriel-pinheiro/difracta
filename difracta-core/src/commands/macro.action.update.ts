import { z } from "zod";

import { actionProblem } from "../address/fire.ts";
import { accepted, defineCommand, rejected } from "../command/command.ts";
import { AddressValueSchema, type MacroAction } from "../document/document.ts";

/**
 * Changes one action's value, or switches it between set and toggle (a
 * switch Address can be set on, set off or toggled). Value edits coalesce
 * per action, so a slider drag undoes as one step.
 */
export const macroActionUpdate = defineCommand({
  name: "macro.action.update",
  kind: "authoring",
  description: "Change a Macro action's value, or its kind.",
  payload: z
    .object({
      macroId: z.string().min(1),
      actionId: z.string().min(1),
      kind: z.enum(["set", "toggle"]).optional(),
      value: AddressValueSchema.optional(),
    })
    .strict(),
  label: () => "Change Action",
  coalesceKey: ({ actionId, kind }) =>
    kind === undefined ? `macro.action.update:${actionId}` : undefined,
  apply({ document, catalog, payload }) {
    const macro = document.macros[payload.macroId];
    if (macro?.kind !== "macro")
      return rejected(`“${payload.macroId}” is not a Macro.`);
    const index = macro.actions.findIndex(
      (action) => action.id === payload.actionId,
    );
    const current = macro.actions[index];
    if (current === undefined)
      return rejected(`Action “${payload.actionId}” is not in the Macro.`);
    if (current.kind === "trigger")
      return rejected("A trigger action has nothing to change.");
    const kind = payload.kind ?? current.kind;
    let next: MacroAction;
    if (kind === "toggle")
      next = { id: current.id, kind, address: current.address };
    else {
      const value =
        payload.value ?? (current.kind === "set" ? current.value : true);
      next = { id: current.id, kind, address: current.address, value };
    }
    const problem = actionProblem(document, catalog, next);
    if (problem !== undefined && !problem.includes("is controlled by"))
      return rejected(problem);
    const actions = macro.actions.with(index, next);
    return accepted([
      { op: "set", path: ["macros", macro.id, "actions"], value: actions },
    ]);
  },
});
