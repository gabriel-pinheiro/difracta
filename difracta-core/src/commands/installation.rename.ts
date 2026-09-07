import { z } from "zod";

import { accepted, defineCommand } from "../command/command.ts";

export const installationRename = defineCommand({
  name: "installation.rename",
  kind: "authoring",
  description: "Rename the Installation.",
  payload: z.object({ name: z.string().trim().min(1).max(120) }).strict(),
  label: () => "Rename Installation",
  coalesceKey: () => "installation.rename",
  apply({ document, payload }) {
    if (document.installation.name === payload.name) return accepted([]);
    return accepted([
      { op: "set", path: ["installation", "name"], value: payload.name },
    ]);
  },
});
