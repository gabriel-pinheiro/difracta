import { parseMediaReference } from "../packs/reference.ts";
import { settings } from "../settings.ts";
import type { Document } from "./document.ts";

/**
 * Media is an image or video entry of a Pack, or a Screen Share. A `media`
 * Parameter holds a Media reference: `<packId>/<entryId>` for an entry, a
 * Screen Share's id for a live one, `""` for none. The type of an entry is
 * read from its file's extension when the Pack is scanned; a Screen Share
 * is always `live`. These helpers run in the browser as well as in Node, so
 * paths are handled here rather than with `node:path`.
 */
export const MEDIA_TYPES = ["image", "video", "live"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

/** The types a file can be, by its extension: what a Pack entry holds. */
export const FILE_MEDIA_TYPES = ["image", "video"] as const;
export type FileMediaType = (typeof FILE_MEDIA_TYPES)[number];

/** "an image", "a video", "a live": the type with its article, for messages. */
export const aMediaType = (type: MediaType): string =>
  type === "image" ? "an image" : `a ${type}`;

/** A video's length in beats and the time in seconds of its first one. */
export interface MediaBeats {
  readonly beats: number;
  readonly firstBeat: number;
}

/** A clip's own tempo in beats per minute, from its beats and its length in seconds. */
export const tempoOf = (beats: number, duration: number): number =>
  (beats * 60) / duration;

/**
 * Beats as a person reads them, "16 beats, 128 BPM", the tempo to one
 * decimal and only when the length in seconds is known.
 */
export function describeBeats(beats: number, duration?: number): string {
  const count = `${String(beats)} ${beats === 1 ? "beat" : "beats"}`;
  if (duration === undefined || !(duration > 0)) return count;
  const tempo = Math.round(tempoOf(beats, duration) * 10) / 10;
  return `${count}, ${String(tempo)} BPM`;
}

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
export function mediaTypeOf(path: string): FileMediaType | undefined {
  const extension = mediaExtension(path);
  if (extension === undefined) return undefined;
  if (IMAGE_EXTENSIONS.includes(extension)) return "image";
  if (VIDEO_EXTENSIONS.includes(extension)) return "video";
  return undefined;
}

/** The name an entry takes from its file at first scan: the file name without its extension. */
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
 * The path to store as a Pack's `relativePath` hint for a Pack folder at
 * `absolutePath` in an Installation whose file sits in `folder`: relative
 * to that folder, with `..` when the Pack is beside it. A folder on another
 * root (another drive) keeps its absolute path, since nothing relative
 * reaches it.
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
 * The folder an Installation file's relative paths are read against: the
 * file's path without its last segment, normalized. Studio uses it with the
 * path from the document's summary, where `node:path` is out of reach.
 */
export function installationFolder(filePath: string): string {
  const normalized = normalizeMediaPath(filePath);
  const root = rootOf(normalized);
  const parent = splitAfterRoot(normalized, root).slice(0, -1).join("/");
  if (root !== "") return `${root}${parent}`;
  return parent === "" ? "." : parent;
}

/** Where a stored relative path points for an Installation file in `folder`, normalized. */
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

/** What a `media` Parameter accepting `accepts` must hold, for messages. */
export function mediaValueExpectation(accepts: MediaType): string {
  return accepts === "live"
    ? 'must be the id of a Screen Share, or "" for none'
    : `must be a Media reference “<pack>/<entry>” to ${aMediaType(accepts)} entry of a Pack, or "" for none`;
}

/**
 * Why `value` cannot be the value of a Media Parameter accepting `accepts`,
 * or undefined when it can. The shape only: `""`, a well-formed
 * `<packId>/<entryId>` for an image or video, a Screen Share the
 * Installation has for live. Whether an entry exists, is of the accepted
 * type and has its file is live status the runtime computes.
 */
export function mediaValueProblem(
  document: Pick<Document, "shares">,
  accepts: MediaType,
  value: unknown,
): string | undefined {
  const expected = mediaValueExpectation(accepts);
  if (value === "") return undefined;
  if (typeof value !== "string") return expected;
  if (accepts === "live")
    return value in document.shares
      ? undefined
      : `${expected}; there is no Screen Share “${value}”`;
  return parseMediaReference(value) === undefined
    ? `${expected}; “${value}” is not one`
    : undefined;
}
