import {
  BASE_PROXY_HEIGHT,
  hasTag,
  mediaReference,
  type FileMediaType,
} from "@difracta/core";
import type { LiveState, PackEntryLive, PackLive } from "@difracta/protocol";

import { matchTier } from "./search";

/**
 * Finding a Pack entry in the Library. The rows are every entry of every
 * loaded Pack, flattened from the `packs` live slice; a scope narrows them
 * to one Pack, one folder inside it, the picked tags and, when the Library
 * is not picking for a Parameter, a type. Search ranks a name match first,
 * then a tag, then the description, then the notes. Without a query the
 * recommended entries come first, then names. A missing entry is left out
 * unless the query names it, so a gone file does not clutter the grid but
 * can still be found.
 */
export interface MediaRow {
  /** `<packId>/<entryId>`: what a Parameter holds, and the row's id in the grid. */
  readonly reference: string;
  readonly packId: string;
  readonly packName: string;
  readonly readOnly: boolean;
  readonly entry: PackEntryLive;
  /** The entry's folder inside the Pack, `""` at the root, `"tunnels/dark"` below. */
  readonly folder: string;
}

export interface MediaScope {
  /** Only this Pack's entries. */
  readonly packId?: string | undefined;
  /** Only entries in this folder of the Pack, or below it. */
  readonly folder?: string | undefined;
  /** Only entries carrying every one of these tags, compared ignoring case. */
  readonly tags: readonly string[];
  readonly type?: FileMediaType | undefined;
}

export const WHOLE_LIBRARY: MediaScope = { tags: [] };

/** `tunnels/04.mp4` → `tunnels`; `04.mp4` → `""`. */
export function folderOf(file: string): string {
  const slash = file.lastIndexOf("/");
  return slash === -1 ? "" : file.slice(0, slash);
}

/** Every entry of every Pack that is not missing, in Pack then manifest order. */
export function mediaRows(
  packs: LiveState["packs"] | Readonly<Record<string, PackLive>>,
): readonly MediaRow[] {
  const rows: MediaRow[] = [];
  for (const [packId, pack] of Object.entries(packs)) {
    if (pack.status === "missing") continue;
    for (const [entryId, entry] of Object.entries(pack.entries))
      rows.push({
        reference: mediaReference(packId, entryId),
        packId,
        packName: pack.name,
        readOnly: pack.readOnly,
        entry,
        folder: folderOf(entry.file),
      });
  }
  return rows;
}

/** Whether `folder` is `scope` or inside it; every folder is inside the root. */
export function inFolder(folder: string, scope: string | undefined): boolean {
  if (scope === undefined || scope === "") return true;
  return folder === scope || folder.startsWith(`${scope}/`);
}

/** Whether a row is in the scope's Pack, folder and type, tags aside. */
export function inScope(row: MediaRow, scope: MediaScope): boolean {
  if (scope.packId !== undefined && row.packId !== scope.packId) return false;
  if (!inFolder(row.folder, scope.folder)) return false;
  if (scope.type !== undefined && row.entry.type !== scope.type) return false;
  return true;
}

export function hasTags(row: MediaRow, tags: readonly string[]): boolean {
  return tags.every((tag) => hasTag(row.entry, tag));
}

/** Whether the query names a missing entry well enough to show it anyway. */
function queryNames(entry: PackEntryLive, needle: string): boolean {
  if (needle === "") return false;
  return (
    entry.name.toLowerCase().includes(needle) ||
    entry.id === needle ||
    entry.file.toLowerCase().includes(needle)
  );
}

/** Lower is better; undefined when the row does not match the query. */
export function scoreRow(row: MediaRow, needle: string): number | undefined {
  const { entry } = row;
  const name = matchTier(needle, entry.name);
  if (name !== undefined) return name;
  if (entry.tags.some((tag) => matchTier(needle, tag, false) !== undefined))
    return 3;
  if (entry.description !== undefined) {
    const description = matchTier(needle, entry.description, false);
    if (description !== undefined) return 4 + description;
  }
  if (entry.notes !== undefined) {
    const notes = matchTier(needle, entry.notes, false);
    if (notes !== undefined) return 6 + notes;
  }
  return undefined;
}

const byName = (a: MediaRow, b: MediaRow): number =>
  a.entry.name.localeCompare(b.entry.name, undefined, { sensitivity: "base" });
const byRecommended = (a: MediaRow, b: MediaRow): number =>
  Number(hasTag(b.entry, "recommended")) -
  Number(hasTag(a.entry, "recommended"));

/** The rows in `scope` with the scope's tags that match `query`, best first. */
export function rankMediaRows(
  rows: readonly MediaRow[],
  query: string,
  scope: MediaScope,
): readonly MediaRow[] {
  const needle = query.trim().toLowerCase();
  const candidates = rows.filter(
    (row) =>
      inScope(row, scope) &&
      hasTags(row, scope.tags) &&
      (row.entry.status === "ok" || queryNames(row.entry, needle)),
  );
  if (needle === "")
    return [...candidates].sort((a, b) => byRecommended(a, b) || byName(a, b));
  return candidates
    .flatMap((row) => {
      const rank = scoreRow(row, needle);
      return rank === undefined ? [] : [{ row, rank }];
    })
    .sort(
      (a, b) =>
        a.rank - b.rank || byRecommended(a.row, b.row) || byName(a.row, b.row),
    )
    .map(({ row }) => row);
}

export interface TagCount {
  /** The tag as first written among the rows. */
  readonly label: string;
  readonly count: number;
}

/**
 * The tags the facet offers: each tag occurring among `ranked` (the rows
 * matching the query, Pack, folder and picked tags), with how many of them
 * carry it, most common first, the picked ones kept whatever their count.
 * A tag no remaining row carries is not offered, so narrowing never leads
 * to an empty grid.
 */
export function tagCounts(
  ranked: readonly MediaRow[],
  picked: readonly string[],
): readonly TagCount[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const row of ranked)
    for (const tag of row.entry.tags) {
      const key = tag.trim().toLowerCase();
      const found = counts.get(key);
      if (found === undefined) counts.set(key, { label: tag.trim(), count: 1 });
      else found.count += 1;
    }
  for (const tag of picked) {
    const key = tag.toLowerCase();
    if (!counts.has(key)) counts.set(key, { label: tag, count: 0 });
  }
  return [...counts.values()].sort(
    (a, b) =>
      b.count - a.count ||
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
  );
}

/** `"a/b/c"` → `["a", "a/b", "a/b/c"]`: the crumbs from the Pack's root down to a folder. */
export function folderCrumbs(folder: string): readonly string[] {
  if (folder === "") return [];
  const segments = folder.split("/");
  return segments.map((_segment, index) =>
    segments.slice(0, index + 1).join("/"),
  );
}

/** The folders directly inside `scope` among `rows`, sorted, for going one level down. */
export function subfolders(
  rows: readonly MediaRow[],
  scope: string | undefined,
): readonly string[] {
  const base = scope === undefined || scope === "" ? "" : `${scope}/`;
  const found = new Set<string>();
  for (const row of rows) {
    if (!inFolder(row.folder, scope) || row.folder === (scope ?? "")) continue;
    const rest = row.folder.slice(base.length);
    const [first] = rest.split("/");
    if (first !== undefined && first !== "") found.add(`${base}${first}`);
  }
  return [...found].sort();
}

/**
 * What a tile plays while the pointer is on it: the smallest baked proxy
 * when it is there, the original for a video without it, nothing for an
 * image.
 */
export function hoverSource(
  entry: Pick<PackEntryLive, "type" | "proxies">,
): "proxy" | "original" | undefined {
  if (entry.type !== "video") return undefined;
  return hasBaseProxy(entry) ? "proxy" : "original";
}

/** Whether the proxy every video gets, the smallest size, is baked: what `/proxy` serves. */
export function hasBaseProxy(entry: Pick<PackEntryLive, "proxies">): boolean {
  return entry.proxies.includes(BASE_PROXY_HEIGHT);
}
