import {
  entryIdFor,
  mediaNameOf,
  mediaTypeOf,
  packIdFor,
  PACK_MANIFEST_VERSION,
  type PackEntry,
  type PackManifest,
} from "@difracta/core";

/** One media file a walk found: its path inside the Pack (POSIX) and its fingerprint. */
export interface ScannedFile {
  readonly file: string;
  readonly fingerprint: string;
}

export interface ScanResult {
  readonly manifest: PackManifest;
  /** The ids of entries whose file the walk did not find. */
  readonly missing: readonly string[];
  /** Whether the manifest differs from the one given, so it needs writing. */
  readonly changed: boolean;
}

/**
 * The manifest a scan produces, from the files found and the manifest the
 * Pack had, if any. Pure: the walk and the disk are elsewhere
 * (`pack-folder.ts`). A first scan assigns the Pack its id and an entry per
 * file; a later one keeps every entry and its metadata, adds entries for new
 * files, re-attaches by fingerprint an entry whose file is gone to a new file
 * with the same fingerprint, takes the new fingerprint of a file replaced
 * under its own name (so its thumbnail and proxy are baked again and a
 * page reloads it), and reports the rest as missing. Nothing is ever
 * removed and no metadata is edited.
 */
export function scanManifest(
  folderName: string,
  files: readonly ScannedFile[],
  previous: PackManifest | undefined,
  random?: () => number,
): ScanResult {
  const sorted = [...files].sort((a, b) => (a.file < b.file ? -1 : 1));
  if (previous === undefined) {
    const taken: string[] = [];
    const entries = sorted.flatMap((file) => {
      const entry = newEntry(file, taken);
      if (entry !== undefined) taken.push(entry.id);
      return entry === undefined ? [] : [entry];
    });
    return {
      manifest: {
        version: PACK_MANIFEST_VERSION,
        id: packIdFor(folderName, random),
        name: folderName.trim() === "" ? "Pack" : folderName.trim(),
        entries,
      },
      missing: [],
      changed: true,
    };
  }
  const byFile = new Map(previous.entries.map((entry) => [entry.file, entry]));
  const present = new Set(sorted.map((file) => file.file));
  const gone = previous.entries.filter((entry) => !present.has(entry.file));
  const entries: PackEntry[] = [...previous.entries];
  const taken = entries.map((entry) => entry.id);
  let changed = false;
  for (const file of sorted) {
    const same = byFile.get(file.file);
    if (same !== undefined) {
      if (same.fingerprint !== file.fingerprint) {
        entries[entries.indexOf(same)] = {
          ...same,
          fingerprint: file.fingerprint,
        };
        changed = true;
      }
      continue;
    }
    const reattached = gone.findIndex(
      (entry) => entry.fingerprint === file.fingerprint,
    );
    if (reattached !== -1) {
      const [entry] = gone.splice(reattached, 1);
      if (entry === undefined) continue;
      const index = entries.indexOf(entry);
      entries[index] = { ...entry, file: file.file };
      changed = true;
      continue;
    }
    const entry = newEntry(file, taken);
    if (entry === undefined) continue;
    entries.push(entry);
    taken.push(entry.id);
    changed = true;
  }
  return {
    manifest: { ...previous, entries },
    missing: gone.map((entry) => entry.id),
    changed,
  };
}

function newEntry(
  file: ScannedFile,
  taken: readonly string[],
): PackEntry | undefined {
  const type = mediaTypeOf(file.file);
  if (type === undefined) return undefined;
  return {
    id: entryIdFor(file.file, taken),
    file: file.file,
    type,
    name: mediaNameOf(file.file),
    tags: [],
    fingerprint: file.fingerprint,
  };
}
