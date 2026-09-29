import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { MEDIA_KINDS, type Media } from "../document/document.ts";
import {
  bundledEntryUnknown,
  childMedia,
  mediaNameOf,
  mediaPathProblem,
  normalizeMediaPath,
} from "../document/media.ts";
import { uniqueName } from "../document/names.ts";
import { orderKeyForNew } from "../document/tree.ts";
import { generateId, id } from "../ids.ts";

/**
 * A new Media file, bundled item, Screen Share or Media Group, last at the root or in the
 * Group it was added to, or right after the sibling `after` names (null for
 * first), so items added one after another keep the order they came in. A
 * file is named after its file unless a name is given; its path is stored
 * relative to the Installation file's folder, as it comes, with separators
 * made POSIX, so a caller on a machine with the file relativizes it first
 * (`relativeMediaPath`). The extension decides the type, and one Difracta
 * cannot show is refused. A bundled item names a Bundled Media entry the
 * Catalog has and is named after it unless a name is given. A Screen
 * Share, a slot a Sharer shares into, and a Group have neither; a Screen
 * Share is named "Screen Share" unless a name is given, numbered while a
 * sibling holds the name.
 */
export const mediaCreate = defineCommand({
  name: "media.create",
  kind: "authoring",
  description:
    "Add a Media item: kind file (default) with an image (png, jpg, jpeg, webp, gif, svg) or video (mp4, webm, mov) path relative to the Installation file's folder, named after the file unless a name is given; kind bundled with the id of a Bundled Media entry (`difracta media bundled`) in bundled, named after the entry unless a name is given; kind share, a Screen Share (type live), a named slot a Difracta Desktop shares a screen or window into, with neither; or kind group, a Media Group, with neither.",
  payload: z
    .object({
      id: z.string().min(1).optional(),
      kind: z.enum(MEDIA_KINDS).default("file"),
      /** Group to add into; null for the root. */
      parentId: z.string().min(1).nullable().default(null),
      path: z.string().trim().min(1).optional(),
      /** The Bundled Media entry a bundled item shows. */
      bundled: z.string().trim().min(1).optional(),
      name: z.string().trim().min(1).max(120).optional(),
      /** Sibling to land after; null for first, absent for last. */
      after: z.string().min(1).nullable().optional(),
    })
    .strict(),
  label: ({ kind, name, path, bundled }) => {
    if (kind === "group") return "Add Media Group";
    if (kind === "share") return "Add Screen Share";
    if (kind === "bundled")
      return `Add Bundled Media “${name ?? bundled ?? ""}”`;
    return `Add Media “${name ?? mediaNameOf(path ?? "")}”`;
  },
  apply({ document, payload, catalog }) {
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
    if (payload.kind !== "file" && payload.path !== undefined)
      return rejected(NO_PATH[payload.kind]);
    if (payload.kind !== "bundled" && payload.bundled !== undefined)
      return rejected(NO_BUNDLED[payload.kind]);
    let media: Media;
    if (payload.kind === "group" || payload.kind === "share") {
      media = {
        ...base,
        kind: payload.kind,
        name: uniqueName(
          taken,
          payload.name ?? (payload.kind === "group" ? "Group" : "Screen Share"),
        ),
      };
    } else if (payload.kind === "bundled") {
      if (payload.bundled === undefined)
        return rejected(
          "A bundled Media item needs the id of a Bundled Media entry in bundled.",
        );
      const entry = catalog.mediaEntry(payload.bundled);
      if (entry === undefined)
        return rejected(bundledEntryUnknown(payload.bundled));
      media = {
        ...base,
        kind: "bundled",
        name: uniqueName(taken, payload.name ?? entry.name),
        bundled: entry.id,
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

const NO_PATH = {
  bundled: "A bundled Media item has no path; it names its entry in bundled.",
  share: "A Screen Share has no path; a Sharer shares into it.",
  group: "A Media Group has no path.",
} as const;

const NO_BUNDLED = {
  file: "A Media file names no Bundled Media entry; add kind bundled for that.",
  share: "A Screen Share names no Bundled Media entry.",
  group: "A Media Group names no Bundled Media entry.",
} as const;
