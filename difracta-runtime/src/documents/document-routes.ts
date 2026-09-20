import { settings } from "@difracta/core";
import type { FastifyInstance } from "fastify";
import path from "node:path";
import { z } from "zod";

import { DOCUMENT_FILE_EXTENSION, serializeDocument } from "./document-file.ts";
import { UNSAVED_CHANGES, type DocumentStore } from "./document-store.ts";

const NOTHING_OPEN = "No Installation is open.";

const ReplaceQuerySchema = z
  .object({ discard: z.enum(["true", "false"]).optional() })
  .strict();

/** The name a downloaded copy gets: the file's, or the Installation's when it has none. */
export function downloadFileName(summary: {
  readonly name: string;
  readonly path: string | null;
}): string {
  if (summary.path !== null) return path.basename(summary.path);
  const stem = summary.name
    // eslint-disable-next-line no-control-regex -- control characters are what must go
    .replace(/[\u0000-\u001f\\/:*?"<>|]+/g, "-")
    .replace(/^[\s.-]+|[\s.-]+$/g, "");
  return `${stem === "" ? "Installation" : stem}${DOCUMENT_FILE_EXTENSION}`;
}

/** An ASCII name for old clients and the real one, percent-encoded, for the rest. */
function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/**
 * The open document as a file over HTTP, for every peer in both document
 * modes, because only content travels and no path on the runtime's disk is
 * named.
 *
 * GET downloads a copy: the text Save would write now, unsaved changes
 * included, without touching the disk or the dirty state.
 *
 * PUT replaces the document's content with the body, a `.difracta` file's
 * text, whatever its content type (`curl -T show.difracta …/document`). It is
 * refused with 409 over unsaved changes unless `?discard=true`. A PUT from
 * another origin is preflighted by browsers and this runtime answers no
 * preflight, so a web page elsewhere cannot replace the show.
 *
 * Success is the document's summary; a failure is `{ error }`.
 */
export function registerDocumentRoutes(
  app: FastifyInstance,
  store: DocumentStore,
): void {
  const route = settings.runtime.documentPath;
  const limit = settings.runtime.maxDocumentBytes;

  app.get(route, (_request, reply) => {
    const session = store.currentSession();
    if (session === undefined)
      return reply.status(404).send({ error: NOTHING_OPEN });
    return reply
      .header("content-type", "application/json; charset=utf-8")
      .header(
        "content-disposition",
        contentDisposition(downloadFileName(session.summary())),
      )
      .header("cache-control", "no-store")
      .send(serializeDocument(session.document));
  });

  // Its own scope, so the body arrives as text here and nowhere else.
  void app.register((scope, _options, done) => {
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser(
      "*",
      { parseAs: "string" },
      (_request, body, next) => {
        next(null, body);
      },
    );
    scope.setErrorHandler(
      (error: { statusCode?: number; message: string }, _request, reply) => {
        const status = error.statusCode ?? 500;
        return reply.status(status).send({
          error:
            status === 413
              ? `The file is larger than the ${String(Math.floor(limit / (1024 * 1024)))} MiB this runtime accepts.`
              : error.message,
        });
      },
    );
    scope.put(route, { bodyLimit: limit }, async (request, reply) => {
      const query = ReplaceQuerySchema.safeParse(request.query);
      if (!query.success)
        return reply
          .status(400)
          .send({ error: "The only query parameter is discard=true." });
      if (typeof request.body !== "string" || request.body.trim() === "")
        return reply.status(400).send({
          error: "Send the text of a .difracta file as the request body.",
        });
      const replaced = await store.replaceContent(
        request.body,
        query.data.discard === "true",
      );
      if (replaced.ok) return reply.send(replaced.result);
      return reply
        .status(replaced.error === UNSAVED_CHANGES ? 409 : 422)
        .send({ error: replaced.error });
    });
    done();
  });
}
