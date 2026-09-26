import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { tableEntries, type Document } from "../document/document.ts";
import type { Patch } from "../document/patch.ts";

/** Patches clearing the Target of every Visual Layer that targets one of `targetIds`. */
export function untargetLayers(
  document: Document,
  targetIds: ReadonlySet<string>,
): Patch[] {
  return tableEntries(document.layers).flatMap((layer): Patch[] =>
    layer.kind === "visual" &&
    layer.target !== null &&
    targetIds.has(layer.target)
      ? [{ op: "set", path: ["layers", layer.id, "target"], value: null }]
      : [],
  );
}

/** Layers targeting the Region lose their Target and render nowhere until another is picked. */
export const regionRemove = defineCommand({
  name: "region.remove",
  kind: "authoring",
  description: "Remove a Region; Layers targeting it lose their Target.",
  payload: z.object({ regionId: z.string().min(1) }).strict(),
  label: () => "Remove Region",
  apply({ document, payload }) {
    if (!(payload.regionId in document.regions))
      return rejected(`Region “${payload.regionId}” does not exist.`);
    return accepted([
      ...untargetLayers(document, new Set([payload.regionId])),
      { op: "remove", path: ["regions", payload.regionId] },
    ]);
  },
});
