import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { tableEntries } from "../document/document.ts";
import type { Patch } from "../document/patch.ts";

/** Removing an Output also drops its mapping from every Surface and unassigns the ones using it. */
export const outputRemove = defineCommand({
  name: "output.remove",
  kind: "authoring",
  description: "Remove an Output.",
  payload: z.object({ outputId: z.string().min(1) }).strict(),
  label: () => "Remove Output",
  apply({ document, payload }) {
    const { outputId } = payload;
    if (!(outputId in document.outputs)) {
      return rejected(`Output “${outputId}” does not exist.`);
    }
    const patches: Patch[] = [];
    for (const surface of tableEntries(document.surfaces)) {
      if (surface.output === outputId) {
        patches.push({
          op: "set",
          path: ["surfaces", surface.id, "output"],
          value: null,
        });
      }
      if (outputId in surface.mappings) {
        patches.push({
          op: "remove",
          path: ["surfaces", surface.id, "mappings", outputId],
        });
      }
    }
    patches.push({ op: "remove", path: ["outputs", outputId] });
    return accepted(patches);
  },
});
