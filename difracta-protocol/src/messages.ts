import { DocumentSchema } from "@difracta/core";
import { z } from "zod";

/**
 * The live protocol between the runtime and every client (Studio, Output,
 * CLI). Two flows share one socket:
 *
 * - State: `subscribe` a document, receive one `snapshot`, then `delta`
 *   messages with per-path patches and a revision. A gap means resubscribe.
 * - Input: `input` messages are unacknowledged latest-wins writes to an
 *   Address; the runtime coalesces them per tick and replicates the result
 *   as ordinary deltas.
 *
 * `command` is a document-scoped acknowledged operation (registry commands,
 * undo, redo). `request` is a runtime-scoped one (documents, files).
 */
export const PROTOCOL_VERSION = 1;

export const ClientKindSchema = z.enum(["studio", "output", "cli"]);
export type ClientKind = z.infer<typeof ClientKindSchema>;

const RequestId = z.string().min(1);
const DocumentIdSchema = z.string().min(1);

export const PatchSchema = z.discriminatedUnion("op", [
  z
    .object({
      op: z.literal("set"),
      path: z.array(z.string()).min(1),
      value: z.unknown(),
    })
    .strict(),
  z
    .object({ op: z.literal("remove"), path: z.array(z.string()).min(1) })
    .strict(),
]);

export const ClientMessageSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("hello"),
      protocolVersion: z.number().int(),
      client: z
        .object({
          kind: ClientKindSchema,
          name: z.string().optional(),
          /**
           * Stable identity that owns this client's undo history across
           * reconnects and invocations (a Studio browser, a CLI user). Defaults
           * to the session id.
           */
          actor: z.string().min(1).max(200).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({ type: z.literal("subscribe"), documentId: DocumentIdSchema })
    .strict(),
  z
    .object({ type: z.literal("unsubscribe"), documentId: DocumentIdSchema })
    .strict(),
  z
    .object({
      type: z.literal("command"),
      requestId: RequestId,
      documentId: DocumentIdSchema,
      name: z.string().min(1),
      payload: z.unknown(),
    })
    .strict(),
  z
    .object({
      type: z.literal("request"),
      requestId: RequestId,
      name: z.string().min(1),
      payload: z.unknown(),
    })
    .strict(),
  z
    .object({
      type: z.literal("input"),
      documentId: DocumentIdSchema,
      address: z.string().min(1),
      value: z.unknown(),
    })
    .strict(),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export const DocumentSummarySchema = z
  .object({
    id: DocumentIdSchema,
    name: z.string(),
    path: z.string().nullable(),
    dirty: z.boolean(),
    revision: z.number().int().nonnegative(),
    outputs: z.array(z.object({ id: z.string(), name: z.string() }).strict()),
  })
  .strict();
export type DocumentSummary = z.infer<typeof DocumentSummarySchema>;

export const ServerMessageSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("welcome"),
      protocolVersion: z.number().int(),
      sessionId: z.string(),
      runtime: z.object({ name: z.string(), version: z.string() }).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("documents"),
      items: z.array(DocumentSummarySchema),
    })
    .strict(),
  z
    .object({
      type: z.literal("snapshot"),
      documentId: DocumentIdSchema,
      revision: z.number().int().nonnegative(),
      document: DocumentSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("delta"),
      documentId: DocumentIdSchema,
      /** The revision the patches apply on top of; a mismatch means resubscribe. */
      fromRevision: z.number().int().nonnegative(),
      revision: z.number().int().nonnegative(),
      patches: z.array(PatchSchema),
      originSessionId: z.string().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("reply"),
      requestId: RequestId,
      outcome: z.discriminatedUnion("ok", [
        z.object({ ok: z.literal(true), result: z.unknown() }).strict(),
        z.object({ ok: z.literal(false), error: z.string() }).strict(),
      ]),
    })
    .strict(),
  z.object({ type: z.literal("error"), message: z.string() }).strict(),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
