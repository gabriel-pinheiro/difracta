import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";

/**
 * Makes a Scene the one the Outputs render, as an immediate cut. A
 * performance command: not undoable, but the active Scene is saved with the
 * file, so this does mark the document as changed.
 */
export const scenePlay = defineCommand({
  name: "scene.play",
  kind: "performance",
  description: "Play a Scene: the Outputs cut to it.",
  payload: z.object({ sceneId: z.string().min(1) }).strict(),
  apply({ document, payload }) {
    if (!(payload.sceneId in document.scenes))
      return rejected(`Scene “${payload.sceneId}” does not exist.`);
    if (document.installation.activeScene === payload.sceneId)
      return accepted([]);
    return accepted([
      {
        op: "set",
        path: ["installation", "activeScene"],
        value: payload.sceneId,
      },
    ]);
  },
});
