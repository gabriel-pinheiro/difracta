import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { treeMove } from "../document/tree.ts";

/** Places a Media item after a sibling (or first) at the root or in a Group; a Group carries its contents. */
export const mediaMove = defineCommand({
  name: "media.move",
  kind: "authoring",
  description: "Move a Media item within or across Media Groups.",
  payload: z
    .object({
      mediaId: z.string().min(1),
      parentId: z.string().min(1).nullable(),
      /** Sibling to land after in the destination; null for the top. */
      after: z.string().min(1).nullable(),
    })
    .strict(),
  label: () => "Move Media",
  coalesceKey: ({ mediaId }) => `media.move:${mediaId}`,
  apply({ document, payload }) {
    const media = document.media[payload.mediaId];
    if (media === undefined)
      return rejected(`Media “${payload.mediaId}” does not exist.`);
    const patches = treeMove(
      { name: "media", table: document.media, noun: "Media" },
      media,
      payload.parentId,
      payload.after,
    );
    return "error" in patches ? rejected(patches.error) : accepted(patches);
  },
});
