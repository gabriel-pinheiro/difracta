import {
  mediaExtension,
  resolveMediaPath,
  withinFolder,
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

export type MediaLocation =
  | { readonly status: "unknown" }
  | { readonly status: "unsaved" }
  | { readonly status: "outside"; readonly file: string }
  | { readonly status: "resolved"; readonly file: string };

/**
 * Where a Media item's file is, before looking at the disk: the item's
 * path resolved against the Installation file's folder. `unknown` for no
 * such item and for a Media Group, which has no file; `unsaved` when
 * the Installation has no file yet, so nothing resolves; `outside` when the
 * resolved path leaves the folder and the runtime does not allow that.
 */
export function locateMedia(
  source: MediaSource,
  id: string,
  allowOutsideShowFolder: boolean,
): MediaLocation {
  const item = source.document.media[id];
  if (item === undefined || item.kind === "group") return { status: "unknown" };
  if (source.path === null) return { status: "unsaved" };
  const folder = path.dirname(source.path);
  const file = resolveMediaPath(folder, item.path);
  if (!allowOutsideShowFolder && !withinFolder(folder, file))
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
  allowOutsideShowFolder: boolean,
): Promise<MediaStatus | undefined> {
  const location = locateMedia(source, id, allowOutsideShowFolder);
  switch (location.status) {
    case "unknown":
      return undefined;
    case "unsaved":
    case "outside":
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
