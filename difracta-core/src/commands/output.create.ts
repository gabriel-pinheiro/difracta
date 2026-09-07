import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { tableEntries, type Output } from "../document/document.ts";
import { uniqueName } from "../document/names.ts";
import { generateId, id } from "../ids.ts";

export const outputCreate = defineCommand({
  name: "output.create",
  kind: "authoring",
  description:
    "Create an Output, a logical rendering destination for one display.",
  payload: z
    .object({
      /** Clients may supply the id so they can address the Output before the reply. */
      id: z.string().min(1).optional(),
      name: z.string().trim().min(1).max(120),
    })
    .strict(),
  label: ({ name }) => `Create Output “${name}”`,
  apply({ document, payload }) {
    const outputId =
      payload.id === undefined
        ? generateId("output")
        : id("output", payload.id);
    if (outputId in document.outputs)
      return rejected(`Output “${outputId}” already exists.`);
    const name = uniqueName(
      tableEntries(document.outputs).map((output) => output.name),
      payload.name,
    );
    const output: Output = { id: outputId, name, limitPixelRatio: false };
    return accepted([
      { op: "set", path: ["outputs", outputId], value: output },
    ]);
  },
});
