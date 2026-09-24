import { z } from "zod";

import { actionProblem } from "../address/fire.ts";
import { accepted, defineCommand, rejected } from "../command/command.ts";
import {
  AddressValueSchema,
  ChanceSchema,
  type MacroAction,
} from "../document/document.ts";

/**
 * Changes one action's value, its Chance, or switches it between set and
 * toggle (a switch Address can be set on, set off or toggled). A trigger
 * action only has a Chance to change. Value edits coalesce per action, and
 * Chance edits separately, so a slider drag undoes as one step.
 */
export const macroActionUpdate = defineCommand({
  name: "macro.action.update",
  kind: "authoring",
  description:
    "Change a Macro action's value, its kind, or its chance (0 to 1; null for always).",
  payload: z
    .object({
      macroId: z.string().min(1),
      actionId: z.string().min(1),
      kind: z.enum(["set", "toggle"]).optional(),
      value: AddressValueSchema.optional(),
      chance: ChanceSchema.nullable().optional(),
    })
    .strict(),
  label: ({ chance, kind, value }) =>
    chance !== undefined && kind === undefined && value === undefined
      ? "Change Chance"
      : "Change Action",
  coalesceKey: ({ actionId, kind, value, chance }) => {
    if (kind !== undefined) return undefined;
    if (chance !== undefined && value === undefined)
      return `macro.action.update:${actionId}:chance`;
    return `macro.action.update:${actionId}`;
  },
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
    const chance =
      payload.chance === undefined ? current.chance : payload.chance;
    const base = {
      id: current.id,
      address: current.address,
      ...(chance === null || chance === undefined ? {} : { chance }),
    };
    let next: MacroAction;
    if (current.kind === "trigger") {
      if (payload.kind !== undefined || payload.value !== undefined)
        return rejected("A trigger action has only its chance to change.");
      next = { ...base, kind: "trigger" };
    } else {
      const kind = payload.kind ?? current.kind;
      if (kind === "toggle") next = { ...base, kind };
      else {
        const value =
          payload.value ?? (current.kind === "set" ? current.value : true);
        next = { ...base, kind, value };
      }
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
