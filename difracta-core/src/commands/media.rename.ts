import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { tableEntries } from "../document/document.ts";
import { uniqueName } from "../document/names.ts";

export const mediaRename = defineCommand({
  name: "media.rename",
  kind: "authoring",
  description: "Rename a Media item.",
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
    const name = uniqueName(
      tableEntries(document.media)
        .filter((item) => item.id !== media.id)
        .map((item) => item.name),
      payload.name,
    );
    if (media.name === name) return accepted([]);
    return accepted([
      { op: "set", path: ["media", media.id, "name"], value: name },
    ]);
  },
});
