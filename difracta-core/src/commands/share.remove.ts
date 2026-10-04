import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { dropActions } from "../document/macros.ts";
import { usesOf } from "../document/media-uses.ts";
import type { Patch } from "../document/patch.ts";

/**
 * Removing a Screen Share clears it from every Live Layer's Parameter
 * holding it, as removing a Surface clears Targets, and drops the Macro set
 * actions that would write it. Whoever shares into it hears the slot went.
 */
export const shareRemove = defineCommand({
  name: "share.remove",
  kind: "authoring",
  description:
    "Remove a Screen Share; Parameters holding it are cleared and Macro actions setting it go. A share into it ends.",
  payload: z.object({ shareId: z.string().min(1) }).strict(),
  label: () => "Remove Screen Share",
  apply({ document, payload, catalog }) {
    const share = document.shares[payload.shareId];
    if (share === undefined)
      return rejected(`Screen Share “${payload.shareId}” does not exist.`);
    const uses = usesOf(document, catalog, share.id);
    const patches: Patch[] = uses
      .filter((use) => use.kind === "layer")
      .map((use) => ({
        op: "set",
        path: ["layers", use.layerId, "parameters", use.parameter],
        value: "",
      }));
    const dropped = new Set(
      uses
        .filter((use) => use.kind === "macro")
        .map((use) => `${use.macroId}:${String(use.action)}`),
    );
    for (const macro of Object.values(document.macros)) {
      if (macro.kind !== "macro") continue;
      patches.push(
        ...dropActions(
          { ...document, macros: { [macro.id]: macro } },
          (action) =>
            !dropped.has(
              `${macro.id}:${String(macro.actions.indexOf(action))}`,
            ),
        ),
      );
    }
    patches.push({ op: "remove", path: ["shares", share.id] });
    return accepted(patches);
  },
});
