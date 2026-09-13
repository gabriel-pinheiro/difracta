import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { MACRO_KINDS, type Macro } from "../document/document.ts";
import { childMacros, MACRO_LABELS } from "../document/macros.ts";
import { uniqueName } from "../document/names.ts";
import { orderKeyForNew } from "../document/tree.ts";
import { generateId, id } from "../ids.ts";

/** A new Macro lands first at the root or in the Group it was added to, or right after the sibling `after` names, with no actions yet. */
export const macroCreate = defineCommand({
  name: "macro.create",
  kind: "authoring",
  description: "Add a Macro or a Macro Group.",
  payload: z
    .object({
      id: z.string().min(1).optional(),
      kind: z.enum(MACRO_KINDS).default("macro"),
      /** Group to add into; null for the root. */
      parentId: z.string().min(1).nullable().default(null),
      name: z.string().trim().min(1).max(120).optional(),
      /** Sibling to land after; null or absent for first. */
      after: z.string().min(1).nullable().optional(),
    })
    .strict(),
  label: ({ kind }) => `Add ${MACRO_LABELS[kind]}`,
  apply({ document, payload }) {
    const macroId =
      payload.id === undefined ? generateId("macro") : id("macro", payload.id);
    if (macroId in document.macros)
      return rejected(`Macro “${macroId}” already exists.`);
    if (payload.parentId !== null) {
      const parent = document.macros[payload.parentId];
      if (parent?.kind !== "group")
        return rejected(`“${payload.parentId}” is not a Macro Group.`);
    }
    const siblings = childMacros(document.macros, payload.parentId);
    const order = orderKeyForNew(siblings, payload.after ?? null, "Macro");
    if (typeof order !== "string") return rejected(order.error);
    const base = {
      id: macroId,
      name: uniqueName(
        siblings.map((sibling) => sibling.name),
        payload.name ?? MACRO_LABELS[payload.kind],
      ),
      parentId: payload.parentId,
      order,
    };
    const macro: Macro =
      payload.kind === "macro"
        ? { ...base, kind: "macro", actions: [] }
        : { ...base, kind: "group" };
    return accepted([{ op: "set", path: ["macros", macroId], value: macro }]);
  },
});
