import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { treeUngroup } from "../document/tree.ts";

/** Dissolves a Media Group: its contents take its place, in their order. */
export const mediaUngroup = defineCommand({
  name: "media.ungroup",
  kind: "authoring",
  description: "Replace a Media Group by its contents.",
  payload: z.object({ mediaId: z.string().min(1) }).strict(),
  label: () => "Ungroup",
  apply({ document, payload }) {
    const group = document.media[payload.mediaId];
    if (group === undefined)
      return rejected(`Media “${payload.mediaId}” does not exist.`);
    const patches = treeUngroup(
      { name: "media", table: document.media, noun: "Media" },
      group,
    );
    return "error" in patches ? rejected(patches.error) : accepted(patches);
  },
});
