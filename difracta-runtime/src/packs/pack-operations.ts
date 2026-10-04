import { BUNDLED_PACK_ID } from "@difracta/core";

import { renamePack, updateEntry, type EntryUpdate } from "./edits.ts";
import {
  existingFolder,
  fail,
  loadedPack,
  writablePack,
  type StoreOutcome,
} from "./pack-files.ts";
import { loadPackFolder } from "./pack-folder.ts";
import { bakeJobsFor, relativeHint } from "./pack-loading.ts";
import type { PackStore } from "./pack-store.ts";

/**
 * What the Pack requests do to the store (`live/pack-requests.ts` calls
 * these): make a folder a Pack, say where a missing one is, walk one again,
 * rename one and change an entry's metadata. Each writes the Pack's folder
 * or the Registry and shows the result through the store; a read-only Pack
 * refuses every write.
 */

/**
 * Makes `folder` a Pack: scans it, writes its manifest, records it in the
 * Registry and loads it. The result carries what `packs.attach` needs,
 * the hint included; the caller attaches.
 */
export async function addPack(
  store: PackStore,
  folder: string,
): Promise<
  StoreOutcome<{ packId: string; name: string; relativePath?: string }>
> {
  const resolved = await existingFolder(folder);
  if (!resolved.ok) return resolved;
  const loaded = await loadPackFolder(resolved.result, store.loadOptions());
  if (!loaded.ok) return loaded;
  const { id, name } = loaded.pack.manifest;
  if (id === BUNDLED_PACK_ID)
    return fail(
      "That folder is the Bundled Pack, which every Installation already has.",
    );
  await store.registry.set(id, { folder: resolved.result, name });
  store.want(id);
  store.install(id, loaded.pack, false);
  const hint = relativeHint(resolved.result, store.installationFolder());
  return {
    ok: true,
    result: {
      packId: id,
      name,
      ...(hint === undefined ? {} : { relativePath: hint }),
    },
  };
}

/** Says where `packId` is: the folder's manifest must carry that id; the Registry learns it and the Pack loads. */
export async function locatePack(
  store: PackStore,
  packId: string,
  folder: string,
): Promise<StoreOutcome<{ packId: string; name: string }>> {
  if (packId === BUNDLED_PACK_ID)
    return fail("The Bundled Pack is always where Difracta is installed.");
  const resolved = await existingFolder(folder);
  if (!resolved.ok) return resolved;
  const loaded = await loadPackFolder(resolved.result, {
    ...store.loadOptions(),
    expectedId: packId,
  });
  if (!loaded.ok) return loaded;
  const { name } = loaded.pack.manifest;
  await store.registry.set(packId, { folder: resolved.result, name });
  if (store.wants(packId))
    store.install(
      packId,
      loaded.pack,
      store.loaded().get(packId)?.pinned ?? false,
    );
  return { ok: true, result: { packId, name } };
}

/** Walks a loaded Pack's folder again. */
export async function rescanPack(
  store: PackStore,
  packId: string,
): Promise<StoreOutcome<{ packId: string }>> {
  const loaded = loadedPack(store.loaded(), packId);
  if (!loaded.ok) return loaded;
  const read = await loadPackFolder(loaded.result.data.folder, {
    ...store.loadOptions(),
    expectedId: packId,
  });
  if (!read.ok) return read;
  store.install(packId, read.pack, loaded.result.pinned);
  return { ok: true, result: { packId } };
}

/** Renames the Pack in its manifest and the Registry; the Installation's copy is the caller's. */
export async function renamePackEverywhere(
  store: PackStore,
  packId: string,
  name: string,
): Promise<StoreOutcome<{ packId: string; name: string }>> {
  const writable = writablePack(store.loaded(), packId);
  if (!writable.ok) return writable;
  const renamed = await store.change(packId, (data) => ({
    ok: true,
    result: {
      data: { ...data, manifest: renamePack(data.manifest, name) },
      persist: true,
      result: data.folder,
    },
  }));
  if (!renamed.ok) return renamed;
  if (store.registry.get(packId) !== undefined)
    await store.registry.set(packId, { folder: renamed.result, name });
  return { ok: true, result: { packId, name } };
}

/** Changes an entry's metadata in its manifest; a new thumbnail time re-bakes its thumbnail. */
export async function updatePackEntry(
  store: PackStore,
  packId: string,
  entryId: string,
  update: EntryUpdate,
): Promise<StoreOutcome<{ packId: string; entryId: string }>> {
  const writable = writablePack(store.loaded(), packId);
  if (!writable.ok) return writable;
  const changed = await store.change(packId, (data) => {
    const edited = updateEntry(data.manifest, entryId, update);
    if (!edited.ok) return edited;
    const { manifest, entry } = edited.result;
    const before = data.manifest.entries.find((it) => it.id === entryId);
    const rebake =
      update.thumbnailAt !== undefined &&
      before?.thumbnailAt !== entry.thumbnailAt &&
      !data.missing.has(entryId);
    const thumbnails = new Set(data.thumbnails);
    if (rebake) thumbnails.delete(entry.fingerprint);
    const next = { ...data, manifest, thumbnails };
    return {
      ok: true,
      result: {
        data: next,
        persist: true,
        result: rebake
          ? bakeJobsFor(packId, next).filter((job) => job.entryId === entryId)
          : [],
      },
    };
  });
  if (!changed.ok) return changed;
  store.bake(changed.result);
  return { ok: true, result: { packId, entryId } };
}
