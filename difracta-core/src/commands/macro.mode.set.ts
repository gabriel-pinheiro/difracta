import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { RUN_MODES } from "../document/document.ts";

/**
 * Sets a Macro's Run Mode: all of its actions, one at random, some at
 * random (`count` of them), or the next one in sequence. The count is kept
 * across modes, so switching back to Some finds it again.
 */
export const macroModeSet = defineCommand({
  name: "macro.mode.set",
  kind: "authoring",
  description:
    "Set a Macro's Run Mode (all, one, some or sequence) and, for some, how many actions a run picks.",
  payload: z
    .object({
      macroId: z.string().min(1),
      mode: z.enum(RUN_MODES).optional(),
      count: z.number().int().min(1).optional(),
    })
    .strict(),
  label: () => "Change Run Mode",
  apply({ document, payload }) {
    const macro = document.macros[payload.macroId];
    if (macro?.kind !== "macro")
      return rejected(`“${payload.macroId}” is not a Macro.`);
    const mode = payload.mode ?? macro.mode;
    const count = payload.count ?? macro.count;
    const patches = [];
    if (mode !== macro.mode)
      patches.push({
        op: "set" as const,
        path: ["macros", macro.id, "mode"],
        value: mode,
      });
    if (count !== macro.count)
      patches.push({
        op: "set" as const,
        path: ["macros", macro.id, "count"],
        value: count,
      });
    return accepted(patches);
  },
});
