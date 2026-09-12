import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { tableEntries } from "../document/document.ts";
import type { Patch } from "../document/patch.ts";
import { removeLinksOfLayers } from "./layer.remove.ts";

/** The active Scene cannot go: the Outputs are showing it. Play another first. */
export const sceneRemove = defineCommand({
  name: "scene.remove",
  kind: "authoring",
  description: "Remove a Scene and every Layer in it.",
  payload: z.object({ sceneId: z.string().min(1) }).strict(),
  label: () => "Remove Scene",
  apply({ document, payload }) {
    const scene = document.scenes[payload.sceneId];
    if (scene === undefined)
      return rejected(`Scene “${payload.sceneId}” does not exist.`);
    if (document.installation.activeScene === scene.id)
      return rejected(
        `“${scene.name}” is the active Scene. Play another Scene first.`,
      );
    const layers = tableEntries(document.layers).filter(
      (layer) => layer.sceneId === scene.id,
    );
    const patches: Patch[] = removeLinksOfLayers(
      document,
      layers.map((layer) => layer.id),
    );
    for (const layer of layers)
      patches.push({ op: "remove", path: ["layers", layer.id] });
    patches.push({ op: "remove", path: ["scenes", scene.id] });
    return accepted(patches);
  },
});
