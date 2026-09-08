import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";

export const maskRemove = defineCommand({
  name: "mask.remove",
  kind: "authoring",
  description: "Remove a Mask.",
  payload: z.object({ maskId: z.string().min(1) }).strict(),
  label: () => "Remove Mask",
  apply({ document, payload }) {
    if (!(payload.maskId in document.masks))
      return rejected(`Mask “${payload.maskId}” does not exist.`);
    return accepted([{ op: "remove", path: ["masks", payload.maskId] }]);
  },
});
