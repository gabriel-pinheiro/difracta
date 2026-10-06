import { BASE_PROXY_HEIGHT, BUNDLED_PACK_ID } from "@difracta/core";
import type { PackEntryLive, PackLive } from "@difracta/protocol";
import { stat } from "node:fs/promises";
import path from "node:path";

import { proxyPath, thumbnailPath, type PackData } from "./pack-folder.ts";
import { entryFilePath } from "./pack-loading.ts";

/** One Pack as the store holds it: its live state and, once read, its folder's data. */
export interface Loaded {
  readonly live: PackLive;
  readonly data: PackData | undefined;
  /** Named with `--pack`: stays loaded whatever the Installation attaches. */
  readonly pinned: boolean;
}

export type StoreOutcome<TResult> =
  | { readonly ok: true; readonly result: TResult }
  | { readonly ok: false; readonly error: string };

export const fail = (error: string): { ok: false; error: string } => ({
  ok: false,
  error,
});

type Ready = Loaded & { readonly data: PackData };

/** The Pack when it is loaded and read, or why it cannot be used. */
export function loadedPack(
  packs: ReadonlyMap<string, Loaded>,
  packId: string,
): StoreOutcome<Ready> {
  const loaded = packs.get(packId);
  if (loaded === undefined) return fail(`No Pack “${packId}” is loaded.`);
  if (loaded.data === undefined || loaded.live.status !== "ok")
    return fail(
      loaded.live.status === "missing"
        ? `Pack “${loaded.live.name}” is missing on this machine; locate its folder first.`
        : `Pack “${loaded.live.name}” is still loading.`,
    );
  return { ok: true, result: { ...loaded, data: loaded.data } };
}

/** The Pack when it may be written: loaded and not read-only. */
export function writablePack(
  packs: ReadonlyMap<string, Loaded>,
  packId: string,
): StoreOutcome<Ready> {
  const loaded = loadedPack(packs, packId);
  if (!loaded.ok) return loaded;
  if (loaded.result.data.readOnly)
    return fail(
      packId === BUNDLED_PACK_ID
        ? "The Bundled Pack is read-only; nothing in it can be changed."
        : `Pack “${loaded.result.live.name}” is read-only; nothing in it can be changed.`,
    );
  return loaded;
}

/** The entry when its Pack is loaded and its file is there. */
export function presentEntry(
  packs: ReadonlyMap<string, Loaded>,
  packId: string,
  entryId: string,
): StoreOutcome<{ data: PackData; live: PackEntryLive }> {
  const loaded = loadedPack(packs, packId);
  if (!loaded.ok) return loaded;
  const live = loaded.result.live.entries[entryId];
  if (live === undefined)
    return fail(`Pack “${loaded.result.live.name}” has no entry “${entryId}”.`);
  if (live.status === "missing")
    return fail(
      `“${live.name}” is missing: no file at ${live.file} in ${loaded.result.data.folder}.`,
    );
  return { ok: true, result: { data: loaded.result.data, live } };
}

/** The file behind `GET /packs/<packId>/<entryId>`. */
export function entryFile(
  packs: ReadonlyMap<string, Loaded>,
  packId: string,
  entryId: string,
): StoreOutcome<string> {
  const entry = presentEntry(packs, packId, entryId);
  if (!entry.ok) return entry;
  const { data, live } = entry.result;
  return { ok: true, result: entryFilePath(data.folder, live.file) };
}

/** The entry's baked thumbnail, or why there is none yet. */
export function thumbnailFile(
  packs: ReadonlyMap<string, Loaded>,
  packId: string,
  entryId: string,
): StoreOutcome<string> {
  const entry = presentEntry(packs, packId, entryId);
  if (!entry.ok) return entry;
  const { data, live } = entry.result;
  if (!live.hasThumbnail) return fail(`“${live.name}” has no thumbnail yet.`);
  return { ok: true, result: thumbnailPath(data.dataDir, live.fingerprint) };
}

/** The entry's baked proxy of `height`, the first size unless said, or why there is none. */
export function proxyFile(
  packs: ReadonlyMap<string, Loaded>,
  packId: string,
  entryId: string,
  height: number = BASE_PROXY_HEIGHT,
): StoreOutcome<string> {
  const entry = presentEntry(packs, packId, entryId);
  if (!entry.ok) return entry;
  const { data, live } = entry.result;
  if (live.type !== "video")
    return fail(`“${live.name}” is an image; it has no proxy.`);
  if (!live.proxies.includes(height))
    return fail(
      height === BASE_PROXY_HEIGHT
        ? `“${live.name}” has no proxy yet.`
        : `“${live.name}” has no proxy ${String(height)} pixels high.`,
    );
  return {
    ok: true,
    result: proxyPath(data.dataDir, live.fingerprint, height),
  };
}

/** An absolute path to an existing folder, normalized, or why it is not one. */
export async function existingFolder(
  folder: string,
): Promise<StoreOutcome<string>> {
  if (!path.isAbsolute(folder))
    return fail(
      `“${folder}” is not an absolute path; the runtime has no folder to resolve it in.`,
    );
  try {
    if (!(await stat(folder)).isDirectory())
      return fail(`${folder} is not a folder.`);
  } catch {
    return fail(`${folder} does not exist on this machine.`);
  }
  return { ok: true, result: path.normalize(folder) };
}
