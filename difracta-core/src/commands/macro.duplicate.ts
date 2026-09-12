import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import type { Macro } from "../document/document.ts";
import { treeDuplicate } from "../document/tree.ts";
import { generateId, id } from "../ids.ts";

/** A copy of the Macro with its actions under fresh ids, right after the original. */
export const macroDuplicate = defineCommand({
  name: "macro.duplicate",
  kind: "authoring",
  description: "Duplicate a Macro below itself.",
  payload: z
    .object({
      macroId: z.string().min(1),
      id: z.string().min(1).optional(),
    })
    .strict(),
  label: () => "Duplicate Macro",
  apply({ document, payload }) {
    const source = document.macros[payload.macroId];
    if (source === undefined)
      return rejected(`Macro “${payload.macroId}” does not exist.`);
    const copyId =
      payload.id === undefined ? generateId("macro") : id("macro", payload.id);
    const patches = treeDuplicate(
      { name: "macros", table: document.macros, noun: "Macro" },
      source,
      copyId,
      () => generateId("macro"),
      (copy): Macro =>
        copy.kind === "macro"
          ? {
              ...copy,
              actions: copy.actions.map((action) => ({
                ...action,
                id: generateId("action"),
              })),
            }
          : copy,
    );
    return "error" in patches ? rejected(patches.error) : accepted(patches);
  },
});
