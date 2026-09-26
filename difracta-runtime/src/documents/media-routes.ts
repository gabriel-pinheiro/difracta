import { settings } from "@difracta/core";
import type { FastifyInstance, FastifyReply } from "fastify";
import { createReadStream } from "node:fs";

import type { DocumentStore } from "./document-store.ts";
import {
  locateBundled,
  locateMedia,
  mediaContentType,
  mediaEtag,
  statMediaFile,
  type MediaServing,
} from "./media-files.ts";

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

/**
 * `GET /media/<id>` streams a Media item's file, a file item's from beside
 * the Installation, a bundled item's from the bundle: the content type from
 * its extension, `Cache-Control: no-cache` with an ETag from size and
 * modification time so a page revalidates cheaply, and Range requests
 * honoured, which video seeking needs. Any origin may read it, so an
 * Output page served from elsewhere (a dev server, another runtime's
 * Studio) can upload the picture to a texture. 404 for an unknown id, a
 * Media Group, a bundled item whose entry the Catalog lacks, a missing
 * file or an Installation without a path; 403 when the resolved path
 * leaves the Installation's folder and the runtime does not allow that.
 *
 * `GET /bundled/<entry id>` streams a Bundled Media entry's file the same
 * way, with no Media item needed, so a page can preview the bundle.
 */
export function registerMediaRoutes(
  app: FastifyInstance,
  store: DocumentStore,
  serving: MediaServing,
): void {
  app.get<{ Params: { id: string } }>(
    `${settings.runtime.bundledPath}/:id`,
    async (request, reply) => {
      const file = locateBundled(serving, request.params.id);
      const info = file === undefined ? undefined : await statMediaFile(file);
      if (file === undefined || info === undefined)
        return reply.status(404).send({
          error:
            file === undefined
              ? `No Bundled Media entry “${request.params.id}”.`
              : `Bundled Media “${request.params.id}”: no file at ${file}; run npm run media:fetch.`,
        });
      return sendFile(reply, file, info, request.headers);
    },
  );

  app.get<{ Params: { id: string } }>(
    `${settings.runtime.mediaPath}/:id`,
    async (request, reply) => {
      const session = store.currentSession();
      if (session === undefined)
        return reply.status(404).send({ error: "No Installation is open." });
      const location = locateMedia(session, request.params.id, serving);
      const item = session.document.media[request.params.id];
      const name = item?.name ?? "";
      switch (location.status) {
        case "unknown":
          return reply.status(404).send({
            error:
              item?.kind === "group"
                ? `“${name}” is a Media Group, which has no file.`
                : `No Media item “${request.params.id}”.`,
          });
        case "unavailable":
          return reply.status(404).send({
            error: `Media “${name}” shows Bundled Media “${location.entry}”, which this runtime lacks.`,
          });
        case "unsaved":
          return reply.status(404).send({
            error: `Media “${name}” cannot be found: the Installation has no file yet, so its Media paths resolve nowhere. Save it first.`,
          });
        case "outside":
          return reply.status(403).send({
            error: `Media “${name}” is outside the Installation's folder; start the runtime with --media-anywhere to serve it.`,
          });
        case "resolved":
          break;
      }
      const info = await statMediaFile(location.file);
      if (info === undefined)
        return reply.status(404).send({
          error: `Media “${name}”: no file at ${location.file}.`,
        });
      return sendFile(reply, location.file, info, request.headers);
    },
  );
}

function sendFile(
  reply: FastifyReply,
  file: string,
  info: { readonly size: number; readonly mtimeMs: number },
  headers: {
    readonly "if-none-match"?: string | undefined;
    readonly "if-range"?: string | undefined;
    readonly range?: string | undefined;
  },
): FastifyReply {
  const etag = mediaEtag(info);
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
