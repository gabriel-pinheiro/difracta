import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { uniqueName } from "../document/names.ts";

/** Names are unique among the Screen Shares, numbered when taken, as every entity's are. */
export const shareRename = defineCommand({
  name: "share.rename",
  kind: "authoring",
  description: "Rename a Screen Share.",
  payload: z
    .object({
      shareId: z.string().min(1),
      name: z.string().trim().min(1).max(120),
    })
    .strict(),
  label: () => "Rename Screen Share",
  coalesceKey: ({ shareId }) => `share.rename:${shareId}`,
  apply({ document, payload }) {
    const share = document.shares[payload.shareId];
    if (share === undefined)
      return rejected(`Screen Share “${payload.shareId}” does not exist.`);
    const name = uniqueName(
      Object.values(document.shares)
        .filter((other) => other.id !== share.id)
        .map((other) => other.name),
      payload.name,
    );
    if (name === share.name) return accepted([]);
    return accepted([
      { op: "set", path: ["shares", share.id, "name"], value: name },
    ]);
  },
});
