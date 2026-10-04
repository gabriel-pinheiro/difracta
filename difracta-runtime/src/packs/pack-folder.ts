import {
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
  /** The fingerprints that have a thumbnail, and those that have a proxy. */
  readonly thumbnails: ReadonlySet<string>;
  readonly proxies: ReadonlySet<string>;
}

export const thumbnailPath = (dataDir: string, fingerprint: string): string =>
  path.join(dataDir, THUMBS, `${fingerprint}.webp`);
export const proxyPath = (dataDir: string, fingerprint: string): string =>
  path.join(dataDir, PROXIES, `${fingerprint}.mp4`);

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

/** The fingerprints that have a baked file in `dir`, by the files' names. */
async function bakedIn(dir: string, extension: string): Promise<Set<string>> {
  try {
    const names = await readdir(dir);
    return new Set(
      names
        .filter((name) => name.endsWith(extension))
        .map((name) => name.slice(0, -extension.length)),
    );
  } catch {
    return new Set();
  }
}

/** The thumbnails and proxies baked under `dataDir`, by fingerprint. */
export async function listBaked(dataDir: string): Promise<{
  readonly thumbnails: Set<string>;
  readonly proxies: Set<string>;
}> {
  return {
    thumbnails: await bakedIn(path.join(dataDir, THUMBS), ".webp"),
    proxies: await bakedIn(path.join(dataDir, PROXIES), ".mp4"),
  };
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
    },
  };
}
