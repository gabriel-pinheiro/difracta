import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { tableEntries } from "../document/document.ts";
import { enabledOutputs, isEnabledOn } from "../document/mappings.ts";
import type { Patch } from "../document/patch.ts";

/**
 * Removing an Output also drops its mapping from every Surface, with a
 * warning for each Surface that loses something.
 */
export const outputRemove = defineCommand({
  name: "output.remove",
  kind: "authoring",
  description: "Remove an Output.",
  payload: z.object({ outputId: z.string().min(1) }).strict(),
  label: () => "Remove Output",
  apply({ document, payload }) {
    const { outputId } = payload;
    const output = document.outputs[outputId];
    if (output === undefined) {
      return rejected(`Output “${outputId}” does not exist.`);
    }
    const patches: Patch[] = [];
    const warnings: string[] = [];
    for (const surface of tableEntries(document.surfaces)) {
      if (!(outputId in surface.mappings)) continue;
      const remaining = enabledOutputs(surface, document.outputs).some(
        (other) => other.id !== outputId,
      );
      warnings.push(
        isEnabledOn(surface, outputId) && !remaining
          ? `Surface “${surface.name}” lost its Output; nothing projects it until one is picked.`
          : `Surface “${surface.name}” lost its Surface Mapping for “${output.name}”.`,
      );
      patches.push({
        op: "remove",
        path: ["surfaces", surface.id, "mappings", outputId],
      });
    }
    patches.push({ op: "remove", path: ["outputs", outputId] });
    return accepted(patches, undefined, warnings);
  },
});
