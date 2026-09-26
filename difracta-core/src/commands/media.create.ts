import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { MEDIA_KINDS, type Media } from "../document/document.ts";
import {
  childMedia,
  mediaNameOf,
  mediaPathProblem,
  normalizeMediaPath,
} from "../document/media.ts";
import { uniqueName } from "../document/names.ts";
import { orderKeyForNew } from "../document/tree.ts";
import { generateId, id } from "../ids.ts";

/**
 * A new Media file, or a Media Group, last at the root or in the Group it
 * was added to, or right after the sibling `after` names (null for first),
 * so files added one after another keep the order they came in. A file is named
 * after its file unless a name is given; its path is stored relative to the
 * Installation file's folder, as it comes, with separators made POSIX, so a
 * caller on a machine with the file relativizes it first
 * (`relativeMediaPath`). The extension decides the type, and one Difracta
 * cannot show is refused. A Group has no path.
 */
export const mediaCreate = defineCommand({
  name: "media.create",
  kind: "authoring",
  description:
    "Add a Media item: kind file (default) with an image (png, jpg, jpeg, webp, gif, svg) or video (mp4, webm, mov) path relative to the Installation file's folder, named after the file unless a name is given; or kind group, a Media Group, with no path.",
  payload: z
    .object({
      id: z.string().min(1).optional(),
      kind: z.enum(MEDIA_KINDS).default("file"),
      /** Group to add into; null for the root. */
      parentId: z.string().min(1).nullable().default(null),
      path: z.string().trim().min(1).optional(),
      name: z.string().trim().min(1).max(120).optional(),
      /** Sibling to land after; null for first, absent for last. */
      after: z.string().min(1).nullable().optional(),
    })
    .strict(),
  label: ({ kind, name, path }) =>
    kind === "group"
      ? "Add Media Group"
      : `Add Media “${name ?? mediaNameOf(path ?? "")}”`,
  apply({ document, payload }) {
    const mediaId =
      payload.id === undefined ? generateId("media") : id("media", payload.id);
    if (mediaId in document.media)
      return rejected(`Media “${mediaId}” already exists.`);
    if (payload.parentId !== null) {
      const parent = document.media[payload.parentId];
      if (parent?.kind !== "group")
        return rejected(`“${payload.parentId}” is not a Media Group.`);
    }
    const siblings = childMedia(document.media, payload.parentId);
    const after =
      payload.after === undefined
        ? (siblings.at(-1)?.id ?? null)
        : payload.after;
    const order = orderKeyForNew(siblings, after, "Media");
    if (typeof order !== "string") return rejected(order.error);
    const taken = siblings.map((sibling) => sibling.name);
    const base = { id: mediaId, parentId: payload.parentId, order };
    let media: Media;
    if (payload.kind === "group") {
      if (payload.path !== undefined)
        return rejected("A Media Group has no path.");
      media = {
        ...base,
        kind: "group",
        name: uniqueName(taken, payload.name ?? "Group"),
      };
    } else {
      if (payload.path === undefined)
        return rejected("A Media file needs a path.");
      const problem = mediaPathProblem(payload.path);
      if (problem !== undefined) return rejected(problem);
      const path = normalizeMediaPath(payload.path);
      media = {
        ...base,
        kind: "file",
        name: uniqueName(taken, payload.name ?? mediaNameOf(path)),
        path,
      };
    }
    return accepted([{ op: "set", path: ["media", mediaId], value: media }]);
  },
});
