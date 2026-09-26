import {
  mediaExtension,
  resolveMediaPath,
  withinFolder,
  type Catalog,
  type Document,
} from "@difracta/core";
import type { MediaStatus } from "@difracta/protocol";
import { stat } from "node:fs/promises";
import path from "node:path";

/** What locating a Media item needs from the open document: its table and where its file is. */
export interface MediaSource {
  readonly document: Pick<Document, "media">;
  readonly path: string | null;
}

/** How this runtime serves Media: what it allows and where the Bundled Media is. */
export interface MediaServing {
  /** Serve files whose path leaves the Installation file's folder. */
  readonly allowOutsideShowFolder: boolean;
  /** The Bundled Media entries; a bundled item whose entry it lacks is unavailable. */
  readonly catalog: Catalog;
  /** The folder the entries' `file`s are relative to. */
  readonly bundledDir: string;
}

export type MediaLocation =
  | { readonly status: "unknown" }
  | { readonly status: "unsaved" }
  | { readonly status: "unavailable"; readonly entry: string }
  | { readonly status: "outside"; readonly file: string }
  | { readonly status: "resolved"; readonly file: string };

/** Where a Bundled Media entry's file is, or undefined when the Catalog lacks it. */
export function locateBundled(
  serving: MediaServing,
  entry: string,
): string | undefined {
  const definition = serving.catalog.mediaEntry(entry);
  return definition === undefined
    ? undefined
    : path.join(serving.bundledDir, ...definition.file.split("/"));
}

/**
 * Where a Media item's file is, before looking at the disk: a file item's
 * path resolved against the Installation file's folder, a bundled item's
 * entry in the bundle's folder. `unknown` for no such item and for a Media
 * Group, which has no file; `unavailable` for a bundled item whose entry
 * the Catalog lacks; `unsaved` when the Installation has no file yet, so no
 * file item resolves; `outside` when the resolved path leaves the folder
 * and the runtime does not allow that.
 */
export function locateMedia(
  source: MediaSource,
  id: string,
  serving: MediaServing,
): MediaLocation {
  const item = source.document.media[id];
  if (item === undefined || item.kind === "group") return { status: "unknown" };
  if (item.kind === "bundled") {
    const file = locateBundled(serving, item.bundled);
    return file === undefined
      ? { status: "unavailable", entry: item.bundled }
      : { status: "resolved", file };
  }
  if (source.path === null) return { status: "unsaved" };
  const folder = path.dirname(source.path);
  const file = resolveMediaPath(folder, item.path);
  if (!serving.allowOutsideShowFolder && !withinFolder(folder, file))
    return { status: "outside", file };
  return { status: "resolved", file };
}

export interface MediaFileInfo {
  readonly size: number;
  readonly mtimeMs: number;
}

/** The file's size and modification time, or undefined when it is not a readable file. */
export async function statMediaFile(
  file: string,
): Promise<MediaFileInfo | undefined> {
  try {
    const info = await stat(file);
    return info.isFile()
      ? { size: info.size, mtimeMs: info.mtimeMs }
      : undefined;
  } catch {
    return undefined;
  }
}

/** The item's status for the live state: undefined when no such item exists or it is a Group. */
export async function mediaStatusOf(
  source: MediaSource,
  id: string,
  serving: MediaServing,
): Promise<MediaStatus | undefined> {
  const location = locateMedia(source, id, serving);
  switch (location.status) {
    case "unknown":
      return undefined;
    case "unsaved":
    case "outside":
    case "unavailable":
      return location.status;
    case "resolved":
      return (await statMediaFile(location.file)) === undefined
        ? "missing"
        : "ok";
  }
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

/** The content type a Media file is served with, from its extension. */
export function mediaContentType(file: string): string {
  return (
    CONTENT_TYPES[mediaExtension(file) ?? ""] ?? "application/octet-stream"
  );
}

/** A weak ETag from size and modification time: what `Cache-Control: no-cache` revalidates against. */
export function mediaEtag(info: MediaFileInfo): string {
  return `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
}
