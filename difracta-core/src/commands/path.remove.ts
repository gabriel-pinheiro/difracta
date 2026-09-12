import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { tableEntries, type Document } from "../document/document.ts";
import type { Patch } from "../document/patch.ts";

/** Patches unbinding `pathIds` from every Visual Layer that binds one of them. */
export function unbindPaths(
  document: Document,
  pathIds: ReadonlySet<string>,
): Patch[] {
  const patches: Patch[] = [];
  for (const layer of tableEntries(document.layers)) {
    if (layer.kind !== "visual") continue;
    const kept = Object.fromEntries(
      Object.entries(layer.paths).filter(([, pathId]) => !pathIds.has(pathId)),
    );
    if (Object.keys(kept).length === Object.keys(layer.paths).length) continue;
    patches.push({
      op: "set",
      path: ["layers", layer.id, "paths"],
      value: kept,
    });
  }
  return patches;
}

/** Layers bound to the Path lose that binding and stop rendering until another is picked. */
export const pathRemove = defineCommand({
  name: "path.remove",
  kind: "authoring",
  description: "Remove a Path; Layers bound to it lose the binding.",
  payload: z.object({ pathId: z.string().min(1) }).strict(),
  label: () => "Remove Path",
  apply({ document, payload }) {
    if (!(payload.pathId in document.paths))
      return rejected(`Path “${payload.pathId}” does not exist.`);
    return accepted([
      ...unbindPaths(document, new Set([payload.pathId])),
      { op: "remove", path: ["paths", payload.pathId] },
    ]);
  },
});
