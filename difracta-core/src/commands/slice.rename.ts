import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { siblingsOf, tableEntries } from "../document/document.ts";
import { uniqueName } from "../document/names.ts";

export const sliceRename = defineCommand({
  name: "slice.rename",
  kind: "authoring",
  description: "Rename a Slice.",
  payload: z
    .object({
      sliceId: z.string().min(1),
      name: z.string().trim().min(1).max(120),
    })
    .strict(),
  label: () => "Rename Slice",
  coalesceKey: ({ sliceId }) => `slice.rename:${sliceId}`,
  apply({ document, payload }) {
    const slice = document.slices[payload.sliceId];
    if (slice === undefined)
      return rejected(`Slice “${payload.sliceId}” does not exist.`);
    const name = uniqueName(
      tableEntries(siblingsOf("slices", document.slices, slice))
        .filter((sibling) => sibling.id !== slice.id)
        .map((sibling) => sibling.name),
      payload.name,
    );
    if (slice.name === name) return accepted([]);
    return accepted([
      { op: "set", path: ["slices", slice.id, "name"], value: name },
    ]);
  },
});
