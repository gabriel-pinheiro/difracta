import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";

export const outputRemove = defineCommand({
  name: "output.remove",
  kind: "authoring",
  description: "Remove an Output.",
  payload: z.object({ outputId: z.string().min(1) }).strict(),
  label: () => "Remove Output",
  apply({ document, payload }) {
    if (!(payload.outputId in document.outputs)) {
      return rejected(`Output “${payload.outputId}” does not exist.`);
    }
    return accepted([{ op: "remove", path: ["outputs", payload.outputId] }]);
  },
});
