import { parseMediaReference, type FileMediaType } from "@difracta/core";

import type { PackEntryView, PacksView } from "./pack-sources.ts";

/**
 * A `packs` slice made up for a page with no runtime: the thumbnail
 * harness and the GPU suite serve their files from data URLs and need
 * only the entries the Layers name, every one loaded and of the given
 * type. `entries` maps a Media reference (`<pack>/<entry>`) to its type; a
 * reference that is not one is left out.
 */
export function fakePacks(
  entries: Readonly<Record<string, FileMediaType>>,
): PacksView {
  const packs: Record<string, Record<string, PackEntryView>> = {};
  for (const [reference, type] of Object.entries(entries)) {
    const parsed = parseMediaReference(reference);
    if (parsed === undefined) continue;
    (packs[parsed.packId] ??= {})[parsed.entryId] = {
      type,
      status: "ok",
      fingerprint: `${"0".repeat(16)}-0`,
    };
  }
  return Object.fromEntries(
    Object.entries(packs).map(([packId, packEntries]) => [
      packId,
      { status: "ok", entries: packEntries },
    ]),
  );
}

/** The type a data URL's media type says it carries; undefined for anything else. */
export function dataUrlMediaType(url: string): FileMediaType | undefined {
  if (url.startsWith("data:image/")) return "image";
  if (url.startsWith("data:video/")) return "video";
  return undefined;
}
