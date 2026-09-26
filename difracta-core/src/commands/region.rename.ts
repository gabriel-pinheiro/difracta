import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { siblingsOf, tableEntries } from "../document/document.ts";
import { uniqueName } from "../document/names.ts";

export const regionRename = defineCommand({
  name: "region.rename",
  kind: "authoring",
  description: "Rename a Region.",
  payload: z
    .object({
      regionId: z.string().min(1),
      name: z.string().trim().min(1).max(120),
    })
    .strict(),
  label: () => "Rename Region",
  coalesceKey: ({ regionId }) => `region.rename:${regionId}`,
  apply({ document, payload }) {
    const region = document.regions[payload.regionId];
    if (region === undefined)
      return rejected(`Region “${payload.regionId}” does not exist.`);
    const name = uniqueName(
      tableEntries(siblingsOf("regions", document.regions, region))
        .filter((sibling) => sibling.id !== region.id)
        .map((sibling) => sibling.name),
      payload.name,
    );
    if (region.name === name) return accepted([]);
    return accepted([
      { op: "set", path: ["regions", region.id, "name"], value: name },
    ]);
  },
});
