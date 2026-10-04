import {
  mediaReferencesInUse,
  parseMediaReference,
  type AddressSource,
  type Catalog,
  type FileMediaType,
} from "@difracta/core";

import type { MediaSource, MediaSources } from "./media-loader.ts";

/**
 * What the engine reads of the `packs` live state, the Packs the runtime
 * has loaded with their entries: the shape under `["live", "packs"]` as
 * the protocol replicates it, read by structure so the render package
 * needs nothing beyond core. The Output page hands it over as it arrives
 * and whenever a patch touches it; the thumbnail harness and the GPU suite
 * make one up (`pack-fakes.ts`).
 */
export interface PackEntryView {
  readonly type: FileMediaType;
  /** `ok`, or `missing` when the entry's file is gone. */
  readonly status: string;
  /** Keys the entry's file: a change under the same reference loads it again. */
  readonly fingerprint: string;
  readonly beats?: number | undefined;
  readonly firstBeat?: number | undefined;
}

export interface PackView {
  /** `loading`, `ok` or `missing`; a missing Pack's entries are nobody's files. */
  readonly status: string;
  readonly entries: Readonly<Record<string, PackEntryView>>;
}

export type PacksView = Readonly<Record<string, PackView>>;

/** No Packs at all: what the engine starts with, so nothing loads until the slice arrives. */
export const NO_PACKS: PacksView = {};

/**
 * One loader source per image or video reference the document names that
 * `packs` has: the entry exists in a Pack that is not missing, its file is
 * there and its type is the one the Parameter accepts. The source's URL is
 * `mediaUrl(reference)`, its revision the entry's fingerprint and its
 * beats the entry's as they are now. A reference into a missing Pack or
 * entry, of another type, or one `mediaUrl` cannot reach gives no source,
 * so its Layer stays blank. Screen Shares are not sources: the Viewer has
 * them.
 */
export function packSources(
  document: AddressSource,
  catalog: Catalog,
  packs: PacksView,
  mediaUrl: (reference: string) => string | undefined,
): MediaSources {
  const sources: Record<string, MediaSource> = {};
  for (const use of mediaReferencesInUse(document, catalog)) {
    if (use.accepts === "live" || use.reference in sources) continue;
    const entry = entryOf(packs, use.reference);
    if (entry?.type !== use.accepts) continue;
    const url = mediaUrl(use.reference);
    if (url === undefined) continue;
    sources[use.reference] = {
      type: entry.type,
      url,
      revision: entry.fingerprint,
      beats:
        entry.beats === undefined
          ? undefined
          : { beats: entry.beats, firstBeat: entry.firstBeat ?? 0 },
    };
  }
  return sources;
}

/** The entry `reference` names, when its Pack is loaded and its file is there. */
export function entryOf(
  packs: PacksView,
  reference: string,
): PackEntryView | undefined {
  const parsed = parseMediaReference(reference);
  if (parsed === undefined) return undefined;
  const pack = packs[parsed.packId];
  if (pack === undefined) return undefined;
  if (pack.status === "missing") return undefined;
  const entry = pack.entries[parsed.entryId];
  return entry?.status === "ok" ? entry : undefined;
}
