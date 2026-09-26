import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { treeRename } from "../document/tree.ts";

/** Names are unique among the item's siblings, as for Macros and Controllers. */
export const mediaRename = defineCommand({
  name: "media.rename",
  kind: "authoring",
  description: "Rename a Media item or Media Group.",
  payload: z
    .object({
      mediaId: z.string().min(1),
      name: z.string().trim().min(1).max(120),
    })
    .strict(),
  label: () => "Rename Media",
  coalesceKey: ({ mediaId }) => `media.rename:${mediaId}`,
  apply({ document, payload }) {
    const media = document.media[payload.mediaId];
    if (media === undefined)
      return rejected(`Media “${payload.mediaId}” does not exist.`);
    const patches = treeRename(
      { name: "media", table: document.media, noun: "Media" },
      media,
      payload.name,
    );
    return "error" in patches ? rejected(patches.error) : accepted(patches);
  },
});
