import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import type { Patch } from "../document/patch.ts";
import { mediaItemType } from "../document/media.ts";
import { settings } from "../settings.ts";

/**
 * Says how many beats a video file lasts, and when its first one falls, so
 * a Video synced to a tempo knows the clip's own: `beats × 60 / duration`.
 * `beats` null takes both away. `firstBeat` left out keeps what the item
 * has; zero is stored as none. A bundled item's beats are its entry's and
 * are not changed here.
 */
export const mediaBeats = defineCommand({
  name: "media.beats",
  kind: "authoring",
  description:
    "Set how many beats a video Media file lasts (16 for a four-bar loop), and optionally firstBeat, the time in seconds of its first beat, so a Video synced to a tempo can follow it; beats null removes both. Bundled items take theirs from their entry.",
  payload: z
    .object({
      mediaId: z.string().min(1),
      beats: z.number().positive().max(settings.media.maxBeats).nullable(),
      firstBeat: z.number().nonnegative().optional(),
    })
    .strict(),
  label: ({ beats }) =>
    beats === null ? "Remove Media Beats" : "Change Media Beats",
  coalesceKey: ({ mediaId }) => `media.beats:${mediaId}`,
  apply({ document, payload }) {
    const media = document.media[payload.mediaId];
    if (media === undefined)
      return rejected(`Media “${payload.mediaId}” does not exist.`);
    if (media.kind === "group")
      return rejected(`“${media.name}” is a Media Group, which has no beats.`);
    if (media.kind === "bundled")
      return rejected(
        `“${media.name}” is bundled Media; its beats are its entry's and cannot be changed.`,
      );
    if (mediaItemType(media) !== "video")
      return rejected(
        `“${media.name}” is not a video; only a video has beats.`,
      );
    if (payload.beats === null && (payload.firstBeat ?? 0) > 0)
      return rejected("A first beat needs beats.");
    const firstBeat =
      payload.beats === null ? 0 : (payload.firstBeat ?? media.firstBeat ?? 0);
    const patches: Patch[] = [];
    const write = (field: "beats" | "firstBeat", value: number | null) => {
      const path = ["media", media.id, field];
      if (value === null) {
        if (media[field] !== undefined) patches.push({ op: "remove", path });
      } else if (media[field] !== value)
        patches.push({ op: "set", path, value });
    };
    write("beats", payload.beats);
    write("firstBeat", firstBeat === 0 ? null : firstBeat);
    return accepted(patches);
  },
});
