import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { tableEntries } from "../document/document.ts";
import type { Patch } from "../document/patch.ts";
import { unbindPaths } from "./path.remove.ts";

export const surfaceRemove = defineCommand({
  name: "surface.remove",
  kind: "authoring",
  description:
    "Remove a Surface with its mappings, Masks and Paths; Layers targeting it lose their Target.",
  payload: z.object({ surfaceId: z.string().min(1) }).strict(),
  label: () => "Remove Surface",
  apply({ document, payload }) {
    if (!(payload.surfaceId in document.surfaces))
      return rejected(`Surface “${payload.surfaceId}” does not exist.`);
    const patches: Patch[] = tableEntries(document.masks)
      .filter((mask) => mask.surfaceId === payload.surfaceId)
      .map((mask) => ({ op: "remove", path: ["masks", mask.id] }));
    const paths = tableEntries(document.paths).filter(
      (path) => path.surfaceId === payload.surfaceId,
    );
    for (const path of paths)
      patches.push({ op: "remove", path: ["paths", path.id] });
    patches.push(...unbindPaths(document, new Set(paths.map((p) => p.id))));
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
