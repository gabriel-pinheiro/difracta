import { BUNDLED_PACK_ID, type Document, type Patch } from "@difracta/core";
import type { KnownPack, PackLive } from "@difracta/protocol";
import path from "node:path";

import {
  Baker,
  type BakeJob,
  type BakeResult,
  type BakeRunner,
} from "./baker.ts";
import { fail, type Loaded, type StoreOutcome } from "./pack-files.ts";
import {
  loadPackFolder,
  writeManifest,
  type LoadOptions,
  type PackData,
} from "./pack-folder.ts";
import {
  diffPackLive,
  loadingLive,
  missingLive,
  packLive,
} from "./pack-live.ts";
import { bakeJobsFor, bakedData, candidateFolders } from "./pack-loading.ts";
import type { PackRegistry } from "./registry.ts";
import type { BakeTools } from "./tools.ts";

export interface PackStoreOptions {
  /** The Bundled Pack's folder. */
  readonly bundledDir: string;
  readonly registry: PackRegistry;
  /** Where Packs whose folder cannot be written keep their data. */
  readonly cacheRoot: string;
  /** ffmpeg and ffprobe; undefined loads Packs without baking. */
  readonly tools: BakeTools | undefined;
  readonly runner?: BakeRunner | undefined;
  readonly log: (message: string) => void;
  readonly random?: (() => number) | undefined;
}

/** What one change to a Pack's data gives: the data to show, whether to write its manifest, and the caller's result. */
export interface Change<TResult> {
  readonly data: PackData;
  readonly persist: boolean;
  readonly result: TResult;
}

/** The open Installation as the store follows it: its attached Packs and where its file is. */
export interface PackSource {
  readonly document: Pick<Document, "packs">;
  readonly path: string | null;
}

/**
 * The Packs this runtime has loaded and their live state, `["packs", id]`:
 * the Bundled Pack, the open Installation's attached Packs and the folders
 * `--pack` named. Following the Installation loads what it attaches
 * (Registry first, then the `relativePath` hint, else `missing`) and
 * unloads what it no longer does. Every change leaves as per-property
 * patches (`pack-live.ts`). Loading a Pack walks its folder and queues what
 * is left to bake; a Pack is written only through the requests here, and a
 * read-only one never. What a request does to a Pack is in
 * `pack-operations.ts`.
 */
export class PackStore {
  readonly #options: PackStoreOptions;
  readonly #packs = new Map<string, Loaded>();
  readonly #listeners = new Set<(patches: readonly Patch[]) => void>();
  readonly #baker: Baker | undefined;
  readonly #serial = new Map<string, Promise<unknown>>();
  readonly #pendingLoads = new Set<Promise<void>>();
  #source: PackSource | undefined;
  #wanted = new Set<string>([BUNDLED_PACK_ID]);

  constructor(options: PackStoreOptions) {
    this.#options = options;
    this.#baker =
      options.tools === undefined
        ? undefined
        : new Baker({
            tools: options.tools,
            runner: options.runner,
            onBaked: (result) =>
              void this.#baked(result).catch((error: unknown) => {
                options.log(`Pack “${result.packId}”: ${String(error)}`);
              }),
            log: options.log,
          });
  }

  /** Whether this runtime can bake: ffmpeg and ffprobe were found. */
  get ffmpeg(): boolean {
    return this.#baker !== undefined;
  }

  onChange(listener: (patches: readonly Patch[]) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  state(): Record<string, PackLive> {
    return Object.fromEntries(
      [...this.#packs].map(([id, loaded]) => [id, loaded.live]),
    );
  }

  /** The loaded Packs, for the file lookups in `pack-files.ts`. */
  loaded(): ReadonlyMap<string, Loaded> {
    return this.#packs;
  }

  /** The Packs the Registry knows, and whether each is loaded. */
  known(): KnownPack[] {
    return this.#options.registry.list().map((entry) => ({
      id: entry.id,
      name: entry.name,
      folder: entry.folder,
      loaded: this.#packs.get(entry.id)?.live.status === "ok",
    }));
  }

  /** Loads the Bundled Pack and the `--pack` folders; resolves once they are read. */
  async start(folders: readonly string[]): Promise<void> {
    await this.#load(
      BUNDLED_PACK_ID,
      "Bundled",
      [this.#options.bundledDir],
      true,
    );
    for (const folder of folders) {
      const loaded = await loadPackFolder(folder, this.loadOptions());
      if (!loaded.ok) {
        this.#options.log(`--pack ${folder} was not loaded: ${loaded.error}`);
        continue;
      }
      const { id, name } = loaded.pack.manifest;
      this.#options.registry.setTransient(id, { folder, name });
      this.#wanted.add(id);
      this.install(id, loaded.pack, true);
    }
  }

  /** Follows the open Installation: loads its attached Packs, unloads the rest. */
  follow(source: PackSource | undefined): void {
    this.#source = source;
    const attached = source?.document.packs ?? {};
    const wanted = new Set<string>([BUNDLED_PACK_ID]);
    for (const [id, loaded] of this.#packs) if (loaded.pinned) wanted.add(id);
    for (const id of Object.keys(attached)) wanted.add(id);
    this.#wanted = wanted;
    for (const id of [...this.#packs.keys()])
      if (!wanted.has(id)) this.#unload(id);
    for (const [id, attachment] of Object.entries(attached)) {
      const current = this.#packs.get(id);
      if (current !== undefined && current.live.status !== "missing") continue;
      const folders = candidateFolders(
        attachment,
        this.#options.registry,
        this.installationFolder(),
      );
      if (current !== undefined && folders.length === 0) continue;
      void this.#load(id, attachment.name, folders, false);
    }
  }

  /** Resolves once every load under way, every write and every bake has finished. */
  async idle(): Promise<void> {
    while (this.#pendingLoads.size > 0)
      await Promise.all([...this.#pendingLoads]);
    await this.#baker?.idle();
    await Promise.all([...this.#serial.values()]);
  }

  close(): void {
    for (const id of [...this.#packs.keys()]) this.#baker?.cancel(id);
    this.#packs.clear();
  }

  /** The open Installation file's folder, which the `relativePath` hint is relative to; null while unsaved. */
  installationFolder(): string | null {
    const file = this.#source?.path ?? null;
    return file === null ? null : path.dirname(file);
  }

  /** What `loadPackFolder` needs from this store. */
  loadOptions(): LoadOptions {
    return {
      cacheRoot: this.#options.cacheRoot,
      random: this.#options.random,
      log: this.#options.log,
    };
  }

  /** Reads the first of `folders` that holds the Pack, else marks it missing. */
  async #load(
    packId: string,
    name: string,
    folders: readonly string[],
    pinned: boolean,
  ): Promise<void> {
    const promise = (async () => {
      if (!this.#packs.has(packId))
        this.#set(packId, {
          live: loadingLive(name, folders[0] ?? "", this.ffmpeg),
          data: undefined,
          pinned,
        });
      const problems: string[] = [];
      for (const folder of folders) {
        const loaded = await loadPackFolder(folder, {
          ...this.loadOptions(),
          expectedId: packId,
        });
        if (!this.#wanted.has(packId)) return;
        if (loaded.ok) {
          this.install(packId, loaded.pack, pinned);
          return;
        }
        problems.push(loaded.error);
      }
      if (!this.#wanted.has(packId)) return;
      for (const problem of problems)
        this.#options.log(`Pack “${name}” (${packId}): ${problem}`);
      this.#set(packId, {
        live: missingLive(name, this.ffmpeg),
        data: undefined,
        pinned,
      });
    })();
    this.#pendingLoads.add(promise);
    await promise.finally(() => this.#pendingLoads.delete(promise));
  }

  /** Shows a Pack as read from its folder and queues what is left to bake. */
  install(packId: string, data: PackData, pinned: boolean): void {
    this.#baker?.cancel(packId);
    this.#set(packId, { live: packLive(data, this.ffmpeg), data, pinned });
    if (!data.readOnly) this.#baker?.enqueue(bakeJobsFor(packId, data));
  }

  #unload(packId: string): void {
    if (!this.#packs.has(packId)) return;
    this.#baker?.cancel(packId);
    this.#packs.delete(packId);
    this.#emit([{ op: "remove", path: ["packs", packId] }]);
  }

  /** Shows `next`; a Pack read for the first time is set whole, a change to one it already shows goes out per property. */
  #set(packId: string, next: Loaded): void {
    const previous = this.#packs.get(packId);
    this.#packs.set(packId, next);
    this.#emit(
      diffPackLive(
        packId,
        previous?.data === undefined ? undefined : previous.live,
        next.live,
      ),
    );
  }

  /**
   * Changes a Pack's data, one change at a time per Pack so a bake landing
   * while a tag is edited loses nothing: `change` sees the data as it is
   * then and gives the next, written to the manifest when `persist`, and
   * shown. Fails when the Pack is not read.
   */
  change<TResult>(
    packId: string,
    change: (data: PackData) => StoreOutcome<Change<TResult>>,
  ): Promise<StoreOutcome<TResult>> {
    const previous = this.#serial.get(packId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async (): Promise<StoreOutcome<TResult>> => {
        const loaded = this.#packs.get(packId);
        if (loaded?.data === undefined)
          return fail(`No Pack “${packId}” is loaded.`);
        const outcome = change(loaded.data);
        if (!outcome.ok) return outcome;
        const { data, persist, result } = outcome.result;
        if (persist) await writeManifest(data.dataDir, data.manifest);
        const current = this.#packs.get(packId);
        if (current !== undefined)
          this.#set(packId, {
            ...current,
            data,
            live: packLive(data, this.ffmpeg),
          });
        return { ok: true, result };
      });
    this.#serial.set(packId, next);
    return next;
  }

  /** A finished bake: the entry's new files, and its measurements into the manifest. */
  async #baked(result: BakeResult): Promise<void> {
    await this.change(result.packId, (data) => {
      const next = bakedData(data, result);
      return next === undefined
        ? fail(`Entry “${result.entryId}” is gone.`)
        : {
            ok: true,
            result: {
              data: next,
              persist: result.probe !== undefined,
              result: undefined,
            },
          };
    });
  }

  /** Keeps `packId` loaded until the Installation says otherwise. */
  want(packId: string): void {
    this.#wanted.add(packId);
  }

  wants(packId: string): boolean {
    return this.#wanted.has(packId);
  }

  /** Queues bake jobs; none without ffmpeg. */
  bake(jobs: readonly BakeJob[]): void {
    this.#baker?.enqueue(jobs);
  }

  get registry(): PackRegistry {
    return this.#options.registry;
  }

  #emit(patches: readonly Patch[]): void {
    if (patches.length === 0) return;
    for (const listener of this.#listeners) listener(patches);
  }
}
