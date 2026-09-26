import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { tableEntries } from "../document/document.ts";
import type { Patch } from "../document/patch.ts";
import { unbindPaths } from "./path.remove.ts";
import { untargetLayers } from "./region.remove.ts";

export const surfaceRemove = defineCommand({
  name: "surface.remove",
  kind: "authoring",
  description:
    "Remove a Surface with its mappings, Regions, Masks and Paths; Layers targeting it or a Region of it lose their Target.",
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
    const regions = tableEntries(document.regions).filter(
      (region) => region.surfaceId === payload.surfaceId,
    );
    for (const region of regions)
      patches.push({ op: "remove", path: ["regions", region.id] });
    patches.push(
      ...untargetLayers(
        document,
        new Set([payload.surfaceId, ...regions.map((region) => region.id)]),
      ),
    );
    patches.push({ op: "remove", path: ["surfaces", payload.surfaceId] });
    return accepted(patches);
  },
});
