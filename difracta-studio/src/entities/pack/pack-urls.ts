import { settings, type PackEntry } from "@difracta/core";

import { studioRuntimeOrigin } from "@/lib/runtime-origin";

/**
 * Where the runtime serves a Pack entry's files, by Media reference:
 * `GET /packs/<packId>/<entryId>` is the original, `/thumb` the baked
 * thumbnail and `/proxy` the baked low-resolution video. The baked ones
 * carry a query naming the fingerprint, and the thumbnail the frame it was
 * taken at, so a re-attached file or a re-baked thumbnail is fetched again.
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

export function packProxyUrl(
  reference: string,
  entry: Pick<PackEntry, "fingerprint">,
): string {
  return `${entryBase(reference)}/proxy?v=${encodeURIComponent(entry.fingerprint)}`;
}
