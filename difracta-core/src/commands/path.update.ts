import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";

/** Whether the Path closes back onto its first point. */
export const pathUpdate = defineCommand({
  name: "path.update",
  kind: "authoring",
  description: "Open or close a Path.",
  payload: z
    .object({ pathId: z.string().min(1), closed: z.boolean() })
    .strict(),
  label: ({ closed }) => (closed ? "Close Path" : "Open Path"),
  apply({ document, payload }) {
    const path = document.paths[payload.pathId];
    if (path === undefined)
      return rejected(`Path “${payload.pathId}” does not exist.`);
    if (path.closed === payload.closed) return accepted([]);
    return accepted([
      { op: "set", path: ["paths", path.id, "closed"], value: payload.closed },
    ]);
  },
});
