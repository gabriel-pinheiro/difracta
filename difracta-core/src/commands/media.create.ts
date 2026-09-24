import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { tableEntries, type Media } from "../document/document.ts";
import {
  mediaNameOf,
  mediaPathProblem,
  normalizeMediaPath,
} from "../document/media.ts";
import { uniqueName } from "../document/names.ts";
import { appendOrderKey } from "../document/order.ts";
import { generateId, id } from "../ids.ts";

/**
 * A new Media item for a file, named after it unless a name is given. The
 * path is stored relative to the Installation file's folder, as it comes,
 * with separators made POSIX; a caller on a machine with the file
 * relativizes it first (`relativeMediaPath`). The extension decides the
 * kind, and one Difracta cannot show is refused.
 */
export const mediaCreate = defineCommand({
  name: "media.create",
  kind: "authoring",
  description:
    "Add a Media item: an image (png, jpg, jpeg, webp, gif, svg) or video (mp4, webm, mov) file by path relative to the Installation file's folder; named after the file unless a name is given.",
  payload: z
    .object({
      id: z.string().min(1).optional(),
      path: z.string().trim().min(1),
      name: z.string().trim().min(1).max(120).optional(),
    })
    .strict(),
  label: ({ name, path }) => `Add Media “${name ?? mediaNameOf(path)}”`,
  apply({ document, payload }) {
    const mediaId =
      payload.id === undefined ? generateId("media") : id("media", payload.id);
    if (mediaId in document.media)
      return rejected(`Media “${mediaId}” already exists.`);
    const problem = mediaPathProblem(payload.path);
    if (problem !== undefined) return rejected(problem);
    const path = normalizeMediaPath(payload.path);
    const media: Media = {
      id: mediaId,
      name: uniqueName(
        tableEntries(document.media).map((item) => item.name),
        payload.name ?? mediaNameOf(path),
      ),
      path,
      order: appendOrderKey(document.media),
    };
    return accepted([{ op: "set", path: ["media", mediaId], value: media }]);
  },
});
