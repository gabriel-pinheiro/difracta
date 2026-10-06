import {
  BASE_PROXY_HEIGHT,
  BUNDLED_PACK_ID,
  parsePackManifest,
  type PackManifest,
} from "@difracta/core";
import { constants } from "node:fs";
import {
  access,
  mkdir,
  readdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { fingerprintFile } from "./fingerprint.ts";
import { scanManifest, type ScannedFile } from "./scan.ts";
import { walkPackFolder } from "./walk.ts";

/** The folder inside a Pack that holds its manifest and baked files. */
export const PACK_DATA_FOLDER = ".difracta";
export const MANIFEST_FILE = "pack.json";
const THUMBS = "thumbs";
const PROXIES = "proxies";

/** A Pack's folder as the runtime has read it. */
export interface PackData {
  /** The Pack's folder, absolute. */
  readonly folder: string;
  /** Where its manifest, thumbnails and proxies live: `.difracta/` inside it, or the cache when that cannot be written. */
  readonly dataDir: string;
  readonly manifest: PackManifest;
  /** Whether the manifest says the Pack is read-only; nothing is written to such a Pack. */
  readonly readOnly: boolean;
  /** The entries whose file the walk did not find. */
  readonly missing: ReadonlySet<string>;
  readonly warning: string | undefined;
  /** The fingerprints that have a thumbnail. */
  readonly thumbnails: ReadonlySet<string>;
  /** The heights each fingerprint's proxy is baked at. */
  readonly proxies: ReadonlyMap<string, ReadonlySet<number>>;
  /**
   * The proxy heights asked for (`media.prepare`) and not baked yet, by
   * entry id. The runtime's own, never written: reading the folder again
   * starts with none.
   */
  readonly asked: ReadonlyMap<string, ReadonlySet<number>>;
}

const THUMBNAIL_EXTENSION = ".webp";
const PROXY_EXTENSION = ".mp4";

export const thumbnailPath = (dataDir: string, fingerprint: string): string =>
  path.join(dataDir, THUMBS, `${fingerprint}${THUMBNAIL_EXTENSION}`);

/**
 * Where a fingerprint's proxy of `height` is: `<fingerprint>.mp4` for the
 * first size, the one every video has, and `<fingerprint>.<height>.mp4`
 * for the others.
 */
export const proxyPath = (
  dataDir: string,
  fingerprint: string,
  height: number = BASE_PROXY_HEIGHT,
): string =>
  path.join(
    dataDir,
    PROXIES,
    height === BASE_PROXY_HEIGHT
      ? `${fingerprint}${PROXY_EXTENSION}`
      : `${fingerprint}.${String(height)}${PROXY_EXTENSION}`,
  );

/** The fingerprint and height a proxy file's name carries, as `proxyPath` writes them; undefined for any other file. */
export function parseProxyName(
  name: string,
): { readonly fingerprint: string; readonly height: number } | undefined {
  if (!name.endsWith(PROXY_EXTENSION)) return undefined;
  const stem = name.slice(0, -PROXY_EXTENSION.length);
  const sized = /^(.+)\.([1-9]\d*)$/.exec(stem);
  if (sized === null)
    return stem === ""
      ? undefined
      : { fingerprint: stem, height: BASE_PROXY_HEIGHT };
  return { fingerprint: sized[1] ?? "", height: Number(sized[2]) };
}

export type ManifestRead =
  | { readonly ok: true; readonly manifest: PackManifest }
  | { readonly ok: false; readonly error: string }
  | undefined;

/** The manifest in `dir`, undefined when there is none, or why it cannot be read. */
export async function readManifest(dir: string): Promise<ManifestRead> {
  const file = path.join(dir, MANIFEST_FILE);
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch {
    return undefined;
  }
  try {
    return parsePackManifest(JSON.parse(text));
  } catch (error) {
    return { ok: false, error: `${file} is not JSON: ${String(error)}` };
  }
}

/** Writes the manifest atomically: a sibling file, then a rename over the target. */
export async function writeManifest(
  dir: string,
  manifest: PackManifest,
): Promise<void> {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, MANIFEST_FILE);
  await writeFile(`${file}.partial`, `${JSON.stringify(manifest, null, 2)}\n`);
  await rename(`${file}.partial`, file);
}

/** Whether `dir` exists, or can be created, and can be written to. */
async function writable(dir: string): Promise<boolean> {
  try {
    await mkdir(dir, { recursive: true });
    await access(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Where a Pack's data goes: `.difracta/` inside it when that can be written
 * (a folder on the user's disk), else `<cacheRoot>/<packId>/` (a read-only
 * mount, a USB stick without permission).
 */
export async function resolveDataDir(
  folder: string,
  packId: string,
  cacheRoot: string,
): Promise<string> {
  const inside = path.join(folder, PACK_DATA_FOLDER);
  return (await writable(inside)) ? inside : path.join(cacheRoot, packId);
}

/** The names of the files in `dir`; none when it is not there. */
async function namesIn(dir: string): Promise<readonly string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

/** The thumbnails baked under `dataDir`, by fingerprint, and the heights each fingerprint's proxy is baked at, by the files' names. */
export async function listBaked(dataDir: string): Promise<{
  readonly thumbnails: Set<string>;
  readonly proxies: Map<string, Set<number>>;
}> {
  const thumbnails = new Set(
    (await namesIn(path.join(dataDir, THUMBS)))
      .filter((name) => name.endsWith(THUMBNAIL_EXTENSION))
      .map((name) => name.slice(0, -THUMBNAIL_EXTENSION.length)),
  );
  const proxies = new Map<string, Set<number>>();
  for (const name of await namesIn(path.join(dataDir, PROXIES))) {
    const parsed = parseProxyName(name);
    if (parsed === undefined) continue;
    const heights = proxies.get(parsed.fingerprint) ?? new Set<number>();
    heights.add(parsed.height);
    proxies.set(parsed.fingerprint, heights);
  }
  return { thumbnails, proxies };
}

export interface LoadOptions {
  readonly cacheRoot: string;
  /** The id the Pack is expected to have, when known: finds its manifest in the cache and refuses another Pack's folder. */
  readonly expectedId?: string | undefined;
  readonly random?: (() => number) | undefined;
  readonly log?: ((message: string) => void) | undefined;
}

export type LoadOutcome =
  | { readonly ok: true; readonly pack: PackData }
  | { readonly ok: false; readonly error: string };

/**
 * Reads a Pack's folder: its manifest (inside it, else in the cache under
 * `expectedId`), then walks and fingerprints its files and brings the
 * manifest up to date (`scan.ts`), writing it when it changed and the Pack
 * is not read-only. A folder without a manifest becomes a new Pack, unless
 * an id was expected: then it is not that Pack. The Bundled Pack is
 * read-only and never written.
 */
export async function loadPackFolder(
  folder: string,
  options: LoadOptions,
): Promise<LoadOutcome> {
  const log = options.log ?? (() => undefined);
  const inside = path.join(folder, PACK_DATA_FOLDER);
  let read = await readManifest(inside);
  if (read === undefined && options.expectedId !== undefined)
    read = await readManifest(path.join(options.cacheRoot, options.expectedId));
  if (read !== undefined && !read.ok) return read;
  if (read === undefined && options.expectedId !== undefined)
    return {
      ok: false,
      error: `${folder} holds no Pack manifest, so it is not “${options.expectedId}”; add it as a new Pack instead.`,
    };
  const previous = read?.manifest;
  if (
    previous !== undefined &&
    options.expectedId !== undefined &&
    previous.id !== options.expectedId
  )
    return {
      ok: false,
      error: `${folder} holds the Pack “${previous.name}” (${previous.id}), not “${options.expectedId}”.`,
    };
  const walk = await walkPackFolder(folder);
  const files: ScannedFile[] = [];
  for (const file of walk.files) {
    try {
      files.push({
        file,
        fingerprint: await fingerprintFile(
          path.join(folder, ...file.split("/")),
        ),
      });
    } catch (error) {
      log(`Skipping ${file} in ${folder}: ${String(error)}`);
    }
  }
  const scanned = scanManifest(
    path.basename(folder),
    files,
    previous,
    options.random,
  );
  const readOnly =
    scanned.manifest.readOnly === true ||
    scanned.manifest.id === BUNDLED_PACK_ID;
  const dataDir = readOnly
    ? inside
    : await resolveDataDir(folder, scanned.manifest.id, options.cacheRoot);
  if (scanned.changed && !readOnly)
    await writeManifest(dataDir, scanned.manifest);
  const baked = await listBaked(dataDir);
  return {
    ok: true,
    pack: {
      folder,
      dataDir,
      manifest: scanned.manifest,
      readOnly,
      missing: new Set(scanned.missing),
      warning: walk.warning,
      ...baked,
      asked: new Map(),
    },
  };
}
