import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import {
  clearMediaValues,
  mediaPathProblem,
  mediaTypeOf,
  normalizeMediaPath,
} from "../document/media.ts";

/**
 * Points a Media file at another file. The type follows the extension, so
 * a change from image to video (or back) clears the Parameters that held
 * the item: they accept only the type it was. A Group has no path.
 */
export const mediaPath = defineCommand({
  name: "media.path",
  kind: "authoring",
  description:
    "Change a Media item's file path, relative to the Installation file's folder; Parameters holding it are cleared if the type changes.",
  payload: z
    .object({ mediaId: z.string().min(1), path: z.string().trim().min(1) })
    .strict(),
  label: () => "Change Media Path",
  coalesceKey: ({ mediaId }) => `media.path:${mediaId}`,
  apply({ document, payload, catalog }) {
    const media = document.media[payload.mediaId];
    if (media === undefined)
      return rejected(`Media “${payload.mediaId}” does not exist.`);
    if (media.kind === "group")
      return rejected(`“${media.name}” is a Media Group, which has no path.`);
    const problem = mediaPathProblem(payload.path);
    if (problem !== undefined) return rejected(problem);
    const path = normalizeMediaPath(payload.path);
    if (media.path === path) return accepted([]);
    const type = mediaTypeOf(path);
    const cleared =
      type === mediaTypeOf(media.path)
        ? []
        : clearMediaValues(
            document,
            catalog,
            (accepts, value) => value === media.id && accepts !== type,
          );
    return accepted([
      ...cleared,
      { op: "set", path: ["media", media.id, "path"], value: path },
    ]);
  },
});
