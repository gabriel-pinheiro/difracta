import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { tableEntries } from "../document/document.ts";
import { uniqueName } from "../document/names.ts";

export const surfaceRename = defineCommand({
  name: "surface.rename",
  kind: "authoring",
  description: "Rename a Surface.",
  payload: z
    .object({
      surfaceId: z.string().min(1),
      name: z.string().trim().min(1).max(120),
    })
    .strict(),
  label: () => "Rename Surface",
  coalesceKey: ({ surfaceId }) => `surface.rename:${surfaceId}`,
  apply({ document, payload }) {
    const surface = document.surfaces[payload.surfaceId];
    if (surface === undefined)
      return rejected(`Surface “${payload.surfaceId}” does not exist.`);
    const name = uniqueName(
      tableEntries(document.surfaces)
        .filter((candidate) => candidate.id !== surface.id)
        .map((candidate) => candidate.name),
      payload.name,
    );
    if (surface.name === name) return accepted([]);
    return accepted([
      { op: "set", path: ["surfaces", surface.id, "name"], value: name },
    ]);
  },
});
