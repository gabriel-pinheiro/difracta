import { z } from "zod";

import { resolveAddress } from "../address/address.ts";
import { unknownAddress } from "../address/unknown.ts";
import { actionProblem } from "../address/fire.ts";
import { accepted, defineCommand, rejected } from "../command/command.ts";
import {
  AddressValueSchema,
  ChanceSchema,
  type MacroAction,
} from "../document/document.ts";
import { generateId } from "../ids.ts";

/** An action as a command receives it: without its id; `chance` absent means always. */
const ActionInput = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("set"),
      address: z.string().min(1),
      value: AddressValueSchema,
      chance: ChanceSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("toggle"),
      address: z.string().min(1),
      chance: ChanceSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("trigger"),
      address: z.string().min(1),
      chance: ChanceSchema.optional(),
    })
    .strict(),
]);

/**
 * Appends actions to a Macro, or inserts them after one of its actions. Any
 * number at once, so a picker that captured fifteen opacities is one
 * command and one undo step. Each action must resolve and fit its Address
 * now; a Link on the Address is not refused, since the Macro may run after
 * the Link goes, and the inspector marks it meanwhile. An action's Chance
 * is optional and 0 to 1.
 */
export const macroActionsAdd = defineCommand({
  name: "macro.actions.add",
  kind: "authoring",
  description:
    "Add actions to a Macro: set an Address, toggle a switch or fire a trigger, each with an optional chance (0 to 1).",
  payload: z
    .object({
      macroId: z.string().min(1),
      actions: z.array(ActionInput).min(1),
      /** Action to insert after; null for the top; absent to append. */
      after: z.string().min(1).nullable().optional(),
    })
    .strict(),
  label: ({ actions }) =>
    actions.length === 1
      ? "Add Action"
      : `Add ${String(actions.length)} Actions`,
  apply({ document, catalog, payload }) {
    const macro = document.macros[payload.macroId];
    if (macro?.kind !== "macro")
      return rejected(`“${payload.macroId}” is not a Macro.`);
    const added: MacroAction[] = [];
    for (const input of payload.actions) {
      const action: MacroAction = { ...input, id: generateId("action") };
      const resolved = resolveAddress(document, action.address, catalog);
      if (resolved === undefined)
        return rejected(unknownAddress(document, action.address, catalog));
      const problem = actionProblem(document, catalog, action);
      if (problem !== undefined && !problem.includes("is controlled by"))
        return rejected(`${resolved.label}: ${problem}`);
      added.push(action);
    }
    const at =
      payload.after === undefined
        ? macro.actions.length
        : payload.after === null
          ? 0
          : macro.actions.findIndex((action) => action.id === payload.after) +
            1;
    if (at === 0 && payload.after !== null && payload.after !== undefined)
      return rejected(`Action “${payload.after}” is not in the Macro.`);
    const actions = [
      ...macro.actions.slice(0, at),
      ...added,
      ...macro.actions.slice(at),
    ];
    return accepted([
      { op: "set", path: ["macros", macro.id, "actions"], value: actions },
    ]);
  },
});
