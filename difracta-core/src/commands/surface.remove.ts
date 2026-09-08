import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";

export const surfaceRemove = defineCommand({
  name: "surface.remove",
  kind: "authoring",
  description: "Remove a Surface and its mappings.",
  payload: z.object({ surfaceId: z.string().min(1) }).strict(),
  label: () => "Remove Surface",
  apply({ document, payload }) {
    if (!(payload.surfaceId in document.surfaces))
      return rejected(`Surface “${payload.surfaceId}” does not exist.`);
    return accepted([{ op: "remove", path: ["surfaces", payload.surfaceId] }]);
  },
});
