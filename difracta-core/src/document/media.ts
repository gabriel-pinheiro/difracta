import type { Catalog } from "../catalog/catalog.ts";
import { settings } from "../settings.ts";
import type { Document, Media, Table } from "./document.ts";
import type { Patch } from "./patch.ts";
import { childrenOf, descendantsOf, flattenTree } from "./tree.ts";

/**
 * A Media file is one image or video the Installation refers to. Its `path`
 * is relative to the Installation file's folder, with POSIX separators and
 * `..` allowed, so a show folder moves between machines with its files. The
 * type is read from the extension and never stored; a bundled item's comes
 * from its Bundled Media entry in the Catalog. These helpers run in the
 * browser as well as in Node, so paths are handled here rather than with
 * `node:path`.
 */
export const MEDIA_TYPES = ["image", "video"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

/** The Media items directly under the root (`parentId` null) or a Group, in order. */
export const childMedia = (
  media: Table<Media>,
  parentId: string | null,
): readonly Media[] => childrenOf(media, parentId);

/** Every Media item in navigator order: depth first from the root. */
export const flattenMedia = (media: Table<Media>): readonly Media[] =>
  flattenTree(media);

/** Every Media item below `mediaId`, depth first in display order; empty unless it is a Group. */
export const descendantMedia = (
  media: Table<Media>,
  mediaId: string,
): readonly Media[] => descendantsOf(media, mediaId);

/**
 * The type of a Media file from its path, or undefined for a Group, a file
 * Difracta cannot show, and a bundled item, whose type only the Catalog
 * knows (`mediaItemTypeIn`).
 */
export const mediaItemType = (item: Media): MediaType | undefined =>
  item.kind === "file" ? mediaTypeOf(item.path) : undefined;

/**
 * The type of any Media item: a file's from its extension, a bundled item's
 * from its entry in `catalog`. Undefined for a Group, a file Difracta
 * cannot show and a bundled item whose entry the Catalog lacks, so such an
 * item is never offered or accepted as a value.
 */
export function mediaItemTypeIn(
  item: Media,
  catalog: Catalog,
): MediaType | undefined {
  if (item.kind === "bundled") return catalog.mediaEntry(item.bundled)?.type;
  return mediaItemType(item);
}

/** The refusal for a Bundled Media id the Catalog lacks. */
export const bundledEntryUnknown = (entry: string): string =>
  `“${entry}” is not in the Bundled Media; \`difracta media bundled\` lists them.`;

const IMAGE_EXTENSIONS: readonly string[] = settings.media.imageExtensions;
const VIDEO_EXTENSIONS: readonly string[] = settings.media.videoExtensions;

/** `logo.PNG` → `png`; undefined for a name without one. */
export function mediaExtension(path: string): string | undefined {
  const name = fileNameOf(path);
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return undefined;
  return name.slice(dot + 1).toLowerCase();
}

/** The type a path's extension says it is; undefined for one Difracta cannot show. */
export function mediaTypeOf(path: string): MediaType | undefined {
  const extension = mediaExtension(path);
  if (extension === undefined) return undefined;
  if (IMAGE_EXTENSIONS.includes(extension)) return "image";
  if (VIDEO_EXTENSIONS.includes(extension)) return "video";
  return undefined;
}

/** Why `path` cannot be a Media item's path, or undefined when it can. */
export function mediaPathProblem(path: string): string | undefined {
  const normalized = normalizeMediaPath(path);
  if (normalized === "." || normalized.endsWith("/"))
    return "A Media path must name a file.";
  if (mediaTypeOf(normalized) !== undefined) return undefined;
  const all = [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS];
  return `“${fileNameOf(normalized)}” is not an image or video Difracta can show; the file must end in ${all.slice(0, -1).join(", ")} or ${all.at(-1) ?? ""}.`;
}

/** The name a Media item takes from its file: the file name without its extension. */
export function mediaNameOf(path: string): string {
  const name = fileNameOf(path);
  const extension = mediaExtension(path);
  return extension === undefined ? name : name.slice(0, -extension.length - 1);
}

function fileNameOf(path: string): string {
  return normalizeMediaPath(path).split("/").at(-1) ?? "";
}

/** `/` or `C:/` when the path is absolute, else the empty string. */
function rootOf(path: string): string {
  if (path.startsWith("/")) return "/";
  const drive = /^[A-Za-z]:\//.exec(path);
  return drive === null ? "" : drive[0];
}

/**
 * A path with forward slashes only, without `.` segments, empty segments or
 * a `..` that a previous segment absorbs. A relative path keeps the `..`
 * segments that lead above its start; an absolute one cannot go above its
 * root. `"."` is the empty relative path.
 */
export function normalizeMediaPath(path: string): string {
  const slashed = path.trim().replaceAll("\\", "/");
  const root = rootOf(slashed);
  const segments: string[] = [];
  for (const segment of slashed.slice(root.length).split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      const last = segments.at(-1);
      if (last !== undefined && last !== "..") segments.pop();
      else if (root === "") segments.push("..");
      continue;
    }
    segments.push(segment);
  }
  const joined = segments.join("/");
  if (root !== "") return `${root}${joined}`;
  return joined === "" ? "." : joined;
}

export function isAbsoluteMediaPath(path: string): boolean {
  return rootOf(path.trim().replaceAll("\\", "/")) !== "";
}

/**
 * The path to store for a file at `absolutePath` in an Installation whose
 * file sits in `folder`: relative to that folder, with `..` when the file
 * is elsewhere. A file on another root (another drive) keeps its absolute
 * path, since nothing relative reaches it.
 */
export function relativeMediaPath(
  absolutePath: string,
  folder: string,
): string {
  const target = normalizeMediaPath(absolutePath);
  const base = normalizeMediaPath(folder);
  const targetRoot = rootOf(target);
  if (targetRoot === "" || targetRoot !== rootOf(base)) return target;
  const targetSegments = splitAfterRoot(target, targetRoot);
  const baseSegments = splitAfterRoot(base, targetRoot);
  let common = 0;
  while (
    common < baseSegments.length &&
    baseSegments[common] === targetSegments[common]
  )
    common += 1;
  const up = baseSegments.slice(common).map(() => "..");
  const down = targetSegments.slice(common);
  const joined = [...up, ...down].join("/");
  return joined === "" ? "." : joined;
}

function splitAfterRoot(path: string, root: string): readonly string[] {
  const rest = path.slice(root.length);
  return rest === "" ? [] : rest.split("/");
}

/**
 * The folder an Installation file's Media paths are relative to: the file's
 * path without its last segment, normalized. Studio uses it with the path
 * from the document's summary, where `node:path` is out of reach.
 */
export function installationFolder(filePath: string): string {
  const normalized = normalizeMediaPath(filePath);
  const root = rootOf(normalized);
  const parent = splitAfterRoot(normalized, root).slice(0, -1).join("/");
  if (root !== "") return `${root}${parent}`;
  return parent === "" ? "." : parent;
}

/** Where a stored Media path points for an Installation file in `folder`, normalized. */
export function resolveMediaPath(folder: string, path: string): string {
  return isAbsoluteMediaPath(path)
    ? normalizeMediaPath(path)
    : normalizeMediaPath(`${folder}/${path}`);
}

/** Whether a resolved path stays inside `folder`, the folder itself not counting. */
export function withinFolder(folder: string, resolved: string): boolean {
  const base = normalizeMediaPath(folder);
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return normalizeMediaPath(resolved).startsWith(prefix);
}

/**
 * Why `value` cannot be the value of a Media Parameter accepting `accepts`,
 * or undefined when it can: the empty string for none, or the id of a Media
 * file or bundled item of that type. A Group is never a value, nor is a
 * bundled item whose entry `catalog` lacks.
 */
export function mediaValueProblem(
  document: Pick<Document, "media">,
  catalog: Catalog,
  accepts: MediaType,
  value: unknown,
): string | undefined {
  const expected = `must be the id of ${anOf(accepts)} Media item, or "" for none`;
  if (value === "") return undefined;
  if (typeof value !== "string") return expected;
  const item = document.media[value];
  if (item === undefined)
    return `${expected}; there is no Media item “${value}”`;
  if (item.kind === "group")
    return `${expected}; “${item.name}” is a Media Group`;
  const type = mediaItemTypeIn(item, catalog);
  if (type === undefined && item.kind === "bundled")
    return `${expected}; “${item.name}” is Bundled Media “${item.bundled}”, which this runtime lacks`;
  if (type !== accepts)
    return `${expected}; “${item.name}” is ${type === undefined ? "a file of another type" : `${anOf(type)} ${type}`}`;
  return undefined;
}

const anOf = (type: MediaType): string => (type === "image" ? "an" : "a");

/**
 * Patches setting to `""` every Media Parameter value that `clear` rejects,
 * on every Layer whose definition the Catalog knows: what removing a Media
 * item, or changing its type, takes with it.
 */
export function clearMediaValues(
  document: Pick<Document, "layers">,
  catalog: Catalog,
  clear: (accepts: MediaType, value: string) => boolean,
): Patch[] {
  const patches: Patch[] = [];
  for (const layer of Object.values(document.layers)) {
    if (layer.kind === "group") continue;
    const id = layer.kind === "visual" ? layer.visual : layer.filter;
    const definition =
      id === null ? undefined : catalog.definition(layer.kind, id);
    if (definition === undefined) continue;
    for (const [name, parameter] of Object.entries(definition.parameters)) {
      if (parameter.kind !== "media") continue;
      const value = layer.parameters[name];
      if (typeof value !== "string" || value === "") continue;
      if (clear(parameter.accepts, value))
        patches.push({
          op: "set",
          path: ["layers", layer.id, "parameters", name],
          value: "",
        });
    }
  }
  return patches;
}
