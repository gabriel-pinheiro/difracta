import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { siblingsOf, tableEntries } from "../document/document.ts";
import { uniqueName } from "../document/names.ts";

export const pathRename = defineCommand({
  name: "path.rename",
  kind: "authoring",
  description: "Rename a Path.",
  payload: z
    .object({
      pathId: z.string().min(1),
      name: z.string().trim().min(1).max(120),
    })
    .strict(),
  label: () => "Rename Path",
  coalesceKey: ({ pathId }) => `path.rename:${pathId}`,
  apply({ document, payload }) {
    const path = document.paths[payload.pathId];
    if (path === undefined)
      return rejected(`Path “${payload.pathId}” does not exist.`);
    const name = uniqueName(
      tableEntries(siblingsOf("paths", document.paths, path))
        .filter((sibling) => sibling.id !== path.id)
        .map((sibling) => sibling.name),
      payload.name,
    );
    if (path.name === name) return accepted([]);
    return accepted([
      { op: "set", path: ["paths", path.id, "name"], value: name },
    ]);
  },
});
