import { settings, type PackEntry } from "@difracta/core";

import { studioRuntimeOrigin } from "@/lib/runtime-origin";

/**
 * Where the runtime serves a Pack entry's files, by Media reference:
 * `GET /packs/<packId>/<entryId>` is the original, `/thumb` the baked
 * thumbnail, `/proxy` the smallest baked proxy and `/proxy/<height>` the
 * proxy of that height. The thumbnail and the Library's proxy carry a query
 * naming the fingerprint, and the thumbnail the frame it was taken at, so a
 * re-attached file or a re-baked thumbnail is fetched again; the compositor
 * versions what it loads itself.
 */
function entryBase(reference: string): string {
  const path = reference.split("/").map(encodeURIComponent).join("/");
  return `${studioRuntimeOrigin()}${settings.runtime.packsPath}/${path}`;
}

export function packEntryUrl(reference: string): string {
  return entryBase(reference);
}

export function packThumbUrl(
  reference: string,
  entry: Pick<PackEntry, "fingerprint" | "thumbnailAt">,
): string {
  const version = `${entry.fingerprint}-${String(entry.thumbnailAt ?? "")}`;
  return `${entryBase(reference)}/thumb?v=${encodeURIComponent(version)}`;
}

/** The entry's proxy of `height`, as the Preview's compositor loads it. */
export function packProxyHeightUrl(reference: string, height: number): string {
  return `${entryBase(reference)}/proxy/${String(height)}`;
}

export function packProxyUrl(
  reference: string,
  entry: Pick<PackEntry, "fingerprint">,
): string {
  return `${entryBase(reference)}/proxy?v=${encodeURIComponent(entry.fingerprint)}`;
}
