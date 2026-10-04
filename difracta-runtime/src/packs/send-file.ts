import { mediaExtension } from "@difracta/core";
import type { FastifyReply } from "fastify";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

export type ByteRange =
  | { readonly start: number; readonly end: number }
  | "unsatisfiable"
  | undefined;

/**
 * The one byte range a `Range` header asks for, within a file of `size`
 * bytes: `bytes=a-b`, `bytes=a-` or `bytes=-n` (the last n bytes). Undefined
 * for no header or one this route does not honour (several ranges, another
 * unit), which serves the whole file; `unsatisfiable` when nothing of it
 * falls inside the file.
 */
export function parseByteRange(
  header: string | undefined,
  size: number,
): ByteRange {
  if (header === undefined) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (match === null) return undefined;
  const [, first = "", last = ""] = match;
  if (first === "" && last === "") return undefined;
  if (first === "") {
    const suffix = Number.parseInt(last, 10);
    if (suffix === 0 || size === 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number.parseInt(first, 10);
  const end = last === "" ? size - 1 : Number.parseInt(last, 10);
  if (start >= size || end < start) return "unsatisfiable";
  return { start, end: Math.min(end, size - 1) };
}

export interface FileInfo {
  readonly size: number;
  readonly mtimeMs: number;
}

/** The file's size and modification time, or undefined when it is not a readable file. */
export async function statFile(file: string): Promise<FileInfo | undefined> {
  try {
    const info = await stat(file);
    return info.isFile()
      ? { size: info.size, mtimeMs: info.mtimeMs }
      : undefined;
  } catch {
    return undefined;
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

/** The content type a media file is served with, from its extension. */
export function mediaContentType(file: string): string {
  return (
    CONTENT_TYPES[mediaExtension(file) ?? ""] ?? "application/octet-stream"
  );
}

/** A weak ETag from size and modification time: what `Cache-Control: no-cache` revalidates against. */
export function fileEtag(info: FileInfo): string {
  return `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
}

export interface RangeHeaders {
  readonly "if-none-match"?: string | undefined;
  readonly "if-range"?: string | undefined;
  readonly range?: string | undefined;
}

/**
 * Streams `file`: the content type from its extension, `Cache-Control:
 * no-cache` with an ETag from size and modification time so a page
 * revalidates cheaply, and Range requests honoured, which video seeking
 * needs. Any origin may read it, so an Output page served from elsewhere (a
 * dev server, another runtime's Studio) can upload the picture to a texture.
 */
export function sendFile(
  reply: FastifyReply,
  file: string,
  info: FileInfo,
  headers: RangeHeaders,
): FastifyReply {
  const etag = fileEtag(info);
  void reply
    .header("accept-ranges", "bytes")
    .header("access-control-allow-origin", "*")
    .header("cache-control", "no-cache")
    .header("etag", etag)
    .header("last-modified", new Date(info.mtimeMs).toUTCString())
    .header("content-type", mediaContentType(file));
  if (headers["if-none-match"] === etag) return reply.status(304).send();
  // A Range against another version of the file asks for the whole file.
  const range =
    headers["if-range"] === undefined || headers["if-range"] === etag
      ? parseByteRange(headers.range, info.size)
      : undefined;
  if (range === "unsatisfiable")
    return reply
      .status(416)
      .header("content-range", `bytes */${String(info.size)}`)
      .send();
  if (range === undefined)
    return reply
      .status(200)
      .header("content-length", String(info.size))
      .send(createReadStream(file));
  return reply
    .status(206)
    .header(
      "content-range",
      `bytes ${String(range.start)}-${String(range.end)}/${String(info.size)}`,
    )
    .header("content-length", String(range.end - range.start + 1))
    .send(createReadStream(file, { start: range.start, end: range.end }));
}
