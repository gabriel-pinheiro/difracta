import { z } from "zod";

import { resolveAddress } from "../address/address.ts";
import { accepted, defineCommand, rejected } from "../command/command.ts";
import { dropActions } from "../document/macros.ts";
import { clearMediaValues, descendantMedia } from "../document/media.ts";
import type { Patch } from "../document/patch.ts";

/**
 * Removing a Media item clears it from every Media Parameter holding it, as
 * removing a Surface clears Targets, and drops the Macro set actions that
 * would write it. A Group goes with its contents, each cleared the same
 * way. The files on disk are not touched.
 */
export const mediaRemove = defineCommand({
  name: "media.remove",
  kind: "authoring",
  description:
    "Remove a Media item, or a Media Group with its contents; Parameters holding them are cleared and Macro actions setting them go. Files stay on disk.",
  payload: z.object({ mediaId: z.string().min(1) }).strict(),
  label: () => "Remove Media",
  apply({ document, payload, catalog }) {
    const media = document.media[payload.mediaId];
    if (media === undefined)
      return rejected(`Media “${payload.mediaId}” does not exist.`);
    const removed = new Set<string>([
      media.id,
      ...descendantMedia(document.media, media.id).map((child) => child.id),
    ]);
    const held = (value: unknown): boolean =>
      typeof value === "string" && removed.has(value);
    const patches: Patch[] = [
      ...clearMediaValues(document, catalog, (_accepts, value) => held(value)),
      ...dropActions(
        document,
        (action) =>
          action.kind !== "set" ||
          !held(action.value) ||
          resolveAddress(document, action.address, catalog)?.type !== "media",
      ),
    ];
    for (const id of removed)
      patches.push({ op: "remove", path: ["media", id] });
    return accepted(patches);
  },
});
