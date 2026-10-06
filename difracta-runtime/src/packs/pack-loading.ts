import {
  BASE_PROXY_HEIGHT,
  normalizeMediaPath,
  relativeMediaPath,
  resolveMediaPath,
  type PackAttachment,
  type PackEntry,
} from "@difracta/core";
import path from "node:path";

import type { BakeJob, BakeResult } from "./baker.ts";
import type { PackData } from "./pack-folder.ts";
import { entryLive } from "./pack-live.ts";
import type { PackRegistry } from "./registry.ts";

/** A path with forward slashes, as the core's path helpers take them. */
const posix = (file: string): string => file.replaceAll("\\", "/");

/**
 * Where an attached Pack's folder is, before looking at the disk: the
 * Registry first, then the Installation's `relativePath` hint against the
 * Installation file's folder (none while the file is unsaved). Undefined
 * when neither says.
 */
export function candidateFolders(
  attachment: Pick<PackAttachment, "id" | "relativePath">,
  registry: PackRegistry,
  installationFolder: string | null,
): readonly string[] {
  const candidates: string[] = [];
  const known = registry.get(attachment.id);
  if (known !== undefined) candidates.push(known.folder);
  if (attachment.relativePath !== undefined && installationFolder !== null)
    candidates.push(
      path.normalize(
        resolveMediaPath(posix(installationFolder), attachment.relativePath),
      ),
    );
  return candidates;
}

/**
 * The `relativePath` hint `packs.attach` records for a Pack at `folder`:
 * its path from the Installation file's folder when the Pack sits inside
 * it or beside it (at most one `..`), so a show folder carrying its Packs
 * opens elsewhere with no Registry. Undefined for a Pack elsewhere, or an
 * unsaved Installation.
 */
export function relativeHint(
  folder: string,
  installationFolder: string | null,
): string | undefined {
  if (installationFolder === null) return undefined;
  const relative = relativeMediaPath(posix(folder), posix(installationFolder));
  if (relative === "." || normalizeMediaPath(relative) !== relative)
    return undefined;
  if (/^([A-Za-z]:)?\//.test(relative)) return undefined;
  const segments = relative.split("/");
  const ups = segments.filter((segment) => segment === "..").length;
  if (ups > 1 || (ups === 1 && segments[0] !== "..")) return undefined;
  return relative;
}

/** The entry's file on disk. */
export function entryFilePath(folder: string, file: string): string {
  return path.join(folder, ...file.split("/"));
}

/** One entry's job with `needs` to bake. */
function bakeJob(
  packId: string,
  pack: PackData,
  entry: PackEntry,
  needs: BakeJob["needs"],
): BakeJob {
  return {
    packId,
    entryId: entry.id,
    file: entryFilePath(pack.folder, entry.file),
    type: entry.type,
    fingerprint: entry.fingerprint,
    dataDir: pack.dataDir,
    thumbnailAt: entry.thumbnailAt,
    duration: entry.duration,
    needs,
  };
}

/**
 * The jobs that bring a loaded Pack's entries to Prepared: those with a
 * file and something still to bake, a video's proxy at the first size
 * only. The other sizes are baked when asked for (`proxyJob`).
 */
export function bakeJobsFor(packId: string, pack: PackData): BakeJob[] {
  const jobs: BakeJob[] = [];
  for (const entry of pack.manifest.entries) {
    const live = entryLive(entry, pack);
    if (live.status === "missing") continue;
    const needs = {
      probe:
        entry.width === undefined ||
        entry.height === undefined ||
        (entry.type === "video" && entry.duration === undefined),
      thumbnail: !live.hasThumbnail,
      proxies:
        entry.type === "video" && !live.proxies.includes(BASE_PROXY_HEIGHT)
          ? [BASE_PROXY_HEIGHT]
          : [],
    };
    if (!needs.probe && !needs.thumbnail && needs.proxies.length === 0)
      continue;
    jobs.push(bakeJob(packId, pack, entry, needs));
  }
  return jobs;
}

/** The job that bakes an entry's proxy of `height` and nothing else. */
export function proxyJob(
  packId: string,
  pack: PackData,
  entry: PackEntry,
  height: number,
): BakeJob {
  return bakeJob(packId, pack, entry, {
    probe: false,
    thumbnail: false,
    proxies: [height],
  });
}

/** `pack` with `height` asked for `entryId`. */
export function withAsked(
  pack: PackData,
  entryId: string,
  height: number,
): PackData {
  const asked = new Map(pack.asked);
  asked.set(entryId, new Set([...(asked.get(entryId) ?? []), height]));
  return { ...pack, asked };
}

/**
 * The Pack's data after one entry was baked: its thumbnail and the proxy
 * heights baked now present, the heights the job was to bake no longer
 * asked, baked or not, and what the probe measured written into its entry.
 * Undefined when the entry is gone from the manifest.
 */
export function bakedData(
  data: PackData,
  result: BakeResult,
): PackData | undefined {
  const entry = data.manifest.entries.find(
    (candidate) => candidate.id === result.entryId,
  );
  if (entry === undefined) return undefined;
  const thumbnails = new Set(data.thumbnails);
  if (result.hasThumbnail) thumbnails.add(entry.fingerprint);
  const proxies = new Map(data.proxies);
  if (result.proxies.length > 0)
    proxies.set(
      entry.fingerprint,
      new Set([...(proxies.get(entry.fingerprint) ?? []), ...result.proxies]),
    );
  const asked = new Map(data.asked);
  const settled = new Set([...result.proxies, ...result.failed]);
  const waiting = [...(asked.get(entry.id) ?? [])].filter(
    (height) => !settled.has(height),
  );
  if (waiting.length > 0) asked.set(entry.id, new Set(waiting));
  else asked.delete(entry.id);
  const measured =
    result.probe === undefined
      ? entry
      : {
          ...entry,
          width: result.probe.width,
          height: result.probe.height,
          ...(result.probe.duration === undefined
            ? {}
            : { duration: result.probe.duration }),
        };
  return {
    ...data,
    manifest: {
      ...data.manifest,
      entries: data.manifest.entries.map((candidate) =>
        candidate.id === entry.id ? measured : candidate,
      ),
    },
    thumbnails,
    proxies,
    asked,
  };
}
