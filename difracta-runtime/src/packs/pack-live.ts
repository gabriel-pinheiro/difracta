import { BASE_PROXY_HEIGHT, type PackEntry, type Patch } from "@difracta/core";
import type { PackEntryLive, PackLive } from "@difracta/protocol";

import type { PackData } from "./pack-folder.ts";

/**
 * Whether an entry has everything baked: its thumbnail, for a video its
 * proxy at the first size, and every proxy height in `asked`.
 */
export function entryPrepared(
  entry: Pick<PackEntryLive, "type" | "hasThumbnail" | "proxies">,
  asked: ReadonlySet<number> = new Set(),
): boolean {
  if (!entry.hasThumbnail) return false;
  if (entry.type === "image") return true;
  if (!entry.proxies.includes(BASE_PROXY_HEIGHT)) return false;
  for (const height of asked) if (!entry.proxies.includes(height)) return false;
  return true;
}

/** The live entry for a manifest entry, from what the Pack's folder holds: its proxy heights smallest first. */
export function entryLive(
  entry: PackEntry,
  pack: Pick<PackData, "missing" | "thumbnails" | "proxies">,
): PackEntryLive {
  return {
    ...entry,
    status: pack.missing.has(entry.id) ? "missing" : "ok",
    hasThumbnail: pack.thumbnails.has(entry.fingerprint),
    proxies: [...(pack.proxies.get(entry.fingerprint) ?? [])].sort(
      (a, b) => a - b,
    ),
  };
}

/**
 * `prepared` over the entries whose file is there: the missing ones cannot
 * be baked. An entry with a proxy height in `asked` (by entry id) still to
 * bake is not done.
 */
export function preparedCount(
  entries: Readonly<Record<string, PackEntryLive>>,
  asked: ReadonlyMap<string, ReadonlySet<number>> = new Map(),
): PackLive["prepared"] {
  let done = 0;
  let total = 0;
  for (const entry of Object.values(entries)) {
    if (entry.status === "missing") continue;
    total += 1;
    if (entryPrepared(entry, asked.get(entry.id))) done += 1;
  }
  return { done, total };
}

/** A loaded Pack's live state. */
export function packLive(pack: PackData, ffmpeg: boolean): PackLive {
  const entries = Object.fromEntries(
    pack.manifest.entries.map((entry) => [entry.id, entryLive(entry, pack)]),
  );
  return {
    name: pack.manifest.name,
    readOnly: pack.readOnly,
    status: "ok",
    folder: pack.folder,
    ...(pack.warning === undefined ? {} : { warning: pack.warning }),
    ffmpeg,
    prepared: preparedCount(entries, pack.asked),
    entries,
  };
}

const same = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * The patches that take `["packs", packId]` from `previous` to `next`: one
 * per Pack property that changed and one per entry property, so a tag edit
 * travels as one small patch and baking as the one entry's `hasThumbnail`
 * and `proxies` and the `prepared` count. A Pack not there before is set whole.
 */
export function diffPackLive(
  packId: string,
  previous: PackLive | undefined,
  next: PackLive,
): Patch[] {
  if (previous === undefined)
    return [{ op: "set", path: ["packs", packId], value: next }];
  const patches: Patch[] = [];
  const base = ["packs", packId];
  for (const key of [
    "name",
    "readOnly",
    "status",
    "folder",
    "warning",
    "ffmpeg",
    "prepared",
  ] as const) {
    if (same(previous[key], next[key])) continue;
    patches.push(
      next[key] === undefined
        ? { op: "remove", path: [...base, key] }
        : { op: "set", path: [...base, key], value: next[key] },
    );
  }
  for (const id of Object.keys(previous.entries))
    if (!(id in next.entries))
      patches.push({ op: "remove", path: [...base, "entries", id] });
  for (const [id, entry] of Object.entries(next.entries)) {
    const before = previous.entries[id];
    if (before === undefined) {
      patches.push({ op: "set", path: [...base, "entries", id], value: entry });
      continue;
    }
    const keys = new Set([...Object.keys(before), ...Object.keys(entry)]);
    for (const key of keys) {
      const was = (before as Record<string, unknown>)[key];
      const now = (entry as Record<string, unknown>)[key];
      if (same(was, now)) continue;
      patches.push(
        now === undefined
          ? { op: "remove", path: [...base, "entries", id, key] }
          : { op: "set", path: [...base, "entries", id, key], value: now },
      );
    }
  }
  return patches;
}

/** A Pack's live state while its folder is read, named as the Installation names it. */
export function loadingLive(
  name: string,
  folder: string,
  ffmpeg: boolean,
): PackLive {
  return {
    name,
    readOnly: false,
    status: "loading",
    folder,
    ffmpeg,
    prepared: { done: 0, total: 0 },
    entries: {},
  };
}

/** A Pack's live state when neither the Registry nor the Installation's hint finds its folder. */
export function missingLive(
  name: string,
  ffmpeg: boolean,
  warning?: string,
): PackLive {
  return {
    name,
    readOnly: false,
    status: "missing",
    folder: "",
    ...(warning === undefined ? {} : { warning }),
    ffmpeg,
    prepared: { done: 0, total: 0 },
    entries: {},
  };
}
