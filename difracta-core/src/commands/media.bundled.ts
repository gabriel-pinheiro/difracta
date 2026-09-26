import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import type { Patch } from "../document/patch.ts";
import {
  bundledEntryUnknown,
  clearMediaValues,
  mediaItemTypeIn,
} from "../document/media.ts";
import { namedAfter } from "../document/names.ts";
import { treeRename } from "../document/tree.ts";

/**
 * Points a bundled Media item at another Bundled Media entry. When the new
 * entry is of another type (image or video) than the item was, the
 * Parameters holding the item are cleared, as `media.path` does for a file.
 * An item still called after its previous entry ("Flash Cut", "Flash Cut 2")
 * takes the new entry's name, as a Layer takes its Visual's; a name the
 * person typed stays. It coalesces per item, so browsing entries undoes as
 * one step. A file or a Group is refused, and so is an entry the Catalog
 * lacks.
 */
export const mediaBundled = defineCommand({
  name: "media.bundled",
  kind: "authoring",
  description:
    "Change the Bundled Media entry a bundled Media item shows, by entry id (`difracta media bundled`); Parameters holding it are cleared if the type changes, and an item still named after its previous entry takes the new entry's name.",
  payload: z
    .object({ mediaId: z.string().min(1), bundled: z.string().trim().min(1) })
    .strict(),
  label: () => "Change Bundled Media",
  coalesceKey: ({ mediaId }) => `media.bundled:${mediaId}`,
  apply({ document, payload, catalog }) {
    const media = document.media[payload.mediaId];
    if (media === undefined)
      return rejected(`Media “${payload.mediaId}” does not exist.`);
    if (media.kind !== "bundled")
      return rejected(
        media.kind === "group"
          ? `“${media.name}” is a Media Group, which shows no Bundled Media.`
          : `“${media.name}” is a Media file; media.path changes its file.`,
      );
    const entry = catalog.mediaEntry(payload.bundled);
    if (entry === undefined)
      return rejected(bundledEntryUnknown(payload.bundled));
    if (media.bundled === entry.id) return accepted([]);
    const cleared: Patch[] =
      entry.type === mediaItemTypeIn(media, catalog)
        ? []
        : clearMediaValues(
            document,
            catalog,
            (accepts, value) => value === media.id && accepts !== entry.type,
          );
    const previous = catalog.mediaEntry(media.bundled);
    const renamed =
      previous !== undefined && namedAfter(media.name, previous.name)
        ? treeRename(
            { name: "media", table: document.media, noun: "Media" },
            media,
            entry.name,
          )
        : [];
    return accepted([
      ...cleared,
      { op: "set", path: ["media", media.id, "bundled"], value: entry.id },
      ...("error" in renamed ? [] : renamed),
    ]);
  },
});
