import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { tableEntries } from "../document/document.ts";
import { uniqueName } from "../document/names.ts";

export const sceneRename = defineCommand({
  name: "scene.rename",
  kind: "authoring",
  description: "Rename a Scene.",
  payload: z
    .object({
      sceneId: z.string().min(1),
      name: z.string().trim().min(1).max(120),
    })
    .strict(),
  label: () => "Rename Scene",
  coalesceKey: ({ sceneId }) => `scene.rename:${sceneId}`,
  apply({ document, payload }) {
    const scene = document.scenes[payload.sceneId];
    if (scene === undefined)
      return rejected(`Scene “${payload.sceneId}” does not exist.`);
    const name = uniqueName(
      tableEntries(document.scenes)
        .filter((other) => other.id !== scene.id)
        .map((other) => other.name),
      payload.name,
    );
    if (name === scene.name) return accepted([]);
    return accepted([
      { op: "set", path: ["scenes", scene.id, "name"], value: name },
    ]);
  },
});
