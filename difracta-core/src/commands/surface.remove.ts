import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { tableEntries } from "../document/document.ts";
import type { Patch } from "../document/patch.ts";

export const surfaceRemove = defineCommand({
  name: "surface.remove",
  kind: "authoring",
  description:
    "Remove a Surface with its mappings and Masks; Layers targeting it lose their Target.",
  payload: z.object({ surfaceId: z.string().min(1) }).strict(),
  label: () => "Remove Surface",
  apply({ document, payload }) {
    if (!(payload.surfaceId in document.surfaces))
      return rejected(`Surface “${payload.surfaceId}” does not exist.`);
    const patches: Patch[] = tableEntries(document.masks)
      .filter((mask) => mask.surfaceId === payload.surfaceId)
      .map((mask) => ({ op: "remove", path: ["masks", mask.id] }));
    for (const layer of tableEntries(document.layers))
      if (layer.kind === "visual" && layer.target === payload.surfaceId)
        patches.push({
          op: "set",
          path: ["layers", layer.id, "target"],
          value: null,
        });
    patches.push({ op: "remove", path: ["surfaces", payload.surfaceId] });
    return accepted(patches);
  },
});
