import { mediaTypeOf, settings } from "@difracta/core";
import { readdir } from "node:fs/promises";
import path from "node:path";

export interface WalkResult {
  /** The media files found, as POSIX paths inside the folder, in path order. */
  readonly files: readonly string[];
  /** Names a limit the walk hit; the files before it were taken. */
  readonly warning?: string;
}

/**
 * The images and videos in a Pack's folder: every file whose extension
 * `settings.media` lists, in folders up to `settings.packs.maxDepth` levels
 * down, in path order, skipping every folder and file whose name starts
 * with a dot. Past `settings.packs.maxMedia` files the rest are left out
 * and the result carries a warning; so does a folder deeper than the walk
 * goes. A folder that cannot be read is skipped.
 */
export async function walkPackFolder(
  folder: string,
  limits: { readonly maxDepth?: number; readonly maxMedia?: number } = {},
): Promise<WalkResult> {
  const maxDepth = limits.maxDepth ?? settings.packs.maxDepth;
  const maxMedia = limits.maxMedia ?? settings.packs.maxMedia;
  const files: string[] = [];
  let tooDeep = false;
  let tooMany = false;
  const visit = async (relative: string, depth: number): Promise<void> => {
    let names: string[];
    try {
      const entries = await readdir(path.join(folder, ...relative.split("/")), {
        withFileTypes: true,
      });
      names = entries
        .filter((entry) => !entry.name.startsWith("."))
        .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name));
    } catch {
      return;
    }
    names.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    for (const name of names) {
      if (tooMany) return;
      const child = relative === "" ? name : `${relative}/${name}`;
      if (name.endsWith("/")) {
        if (depth >= maxDepth) tooDeep = true;
        else await visit(child.slice(0, -1), depth + 1);
        continue;
      }
      if (mediaTypeOf(name) === undefined) continue;
      if (files.length >= maxMedia) {
        tooMany = true;
        return;
      }
      files.push(child);
    }
  };
  await visit("", 0);
  const warnings = [
    ...(tooMany
      ? [
          `This Pack holds more than ${maxMedia} images and videos; the first ${maxMedia} by path were taken.`,
        ]
      : []),
    ...(tooDeep
      ? [`Folders more than ${maxDepth} levels deep were not scanned.`]
      : []),
  ];
  return warnings.length === 0
    ? { files }
    : { files, warning: warnings.join(" ") };
}
