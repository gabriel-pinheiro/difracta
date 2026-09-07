import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { tableEntries } from "../document/document.ts";
import { uniqueName } from "../document/names.ts";

export const outputRename = defineCommand({
  name: "output.rename",
  kind: "authoring",
  description: "Rename an Output.",
  payload: z
    .object({
      outputId: z.string().min(1),
      name: z.string().trim().min(1).max(120),
    })
    .strict(),
  label: () => "Rename Output",
  coalesceKey: ({ outputId }) => `output.rename:${outputId}`,
  apply({ document, payload }) {
    const output = document.outputs[payload.outputId];
    if (output === undefined)
      return rejected(`Output “${payload.outputId}” does not exist.`);
    const name = uniqueName(
      tableEntries(document.outputs)
        .filter((candidate) => candidate.id !== output.id)
        .map((candidate) => candidate.name),
      payload.name,
    );
    if (output.name === name) return accepted([]);
    return accepted([
      { op: "set", path: ["outputs", output.id, "name"], value: name },
    ]);
  },
});
