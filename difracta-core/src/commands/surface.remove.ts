import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { tableEntries } from "../document/document.ts";
import type { Patch } from "../document/patch.ts";

export const surfaceRemove = defineCommand({
  name: "surface.remove",
  kind: "authoring",
  description: "Remove a Surface with its mappings and Masks.",
  payload: z.object({ surfaceId: z.string().min(1) }).strict(),
  label: () => "Remove Surface",
  apply({ document, payload }) {
    if (!(payload.surfaceId in document.surfaces))
      return rejected(`Surface “${payload.surfaceId}” does not exist.`);
    const patches: Patch[] = tableEntries(document.masks)
      .filter((mask) => mask.surfaceId === payload.surfaceId)
      .map((mask) => ({ op: "remove", path: ["masks", mask.id] }));
    patches.push({ op: "remove", path: ["surfaces", payload.surfaceId] });
    return accepted(patches);
  },
});
