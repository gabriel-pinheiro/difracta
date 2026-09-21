import { z } from "zod";

/**
 * Runtime-scoped requests: the document, the Catalog and the Display Hosts.
 * These are not Document commands; they manage which Document the runtime
 * has open, read what the runtime is built with, or reach another
 * connection. Names and payload schemas live here so the runtime, Studio and
 * CLI agree.
 *
 * A connection whose `welcome` said `documents: "pinned"` is refused
 * `documents.new`, `documents.open`, `documents.close` and a
 * `documents.save` to another path.
 */
export const RuntimeRequestSchemas = {
  /** Replaces the open document with a new, unsaved one. */
  "documents.new": z
    .object({
      name: z.string().trim().min(1).max(120),
      /** Drop unsaved changes of the current document instead of failing. */
      discard: z.boolean().optional(),
    })
    .strict(),
  /** Replaces the open document with a file. */
  "documents.open": z
    .object({
      /**
       * Absolute path on the runtime's machine. When an autosave newer than
       * the file exists it is loaded instead and the document opens dirty
       * and `recovered`.
       */
      path: z.string().min(1),
      discard: z.boolean().optional(),
    })
    .strict(),
  "documents.save": z
    .object({
      documentId: z.string().min(1),
      /** Save As: a new absolute path on the runtime's machine. */
      path: z.string().min(1).optional(),
    })
    .strict(),
  /** Reload the file as last saved over the open document, dropping autosaves. */
  "documents.revert": z.object({ documentId: z.string().min(1) }).strict(),
  "documents.close": z
    .object({ documentId: z.string().min(1), discard: z.boolean().optional() })
    .strict(),
  /** The Visual and Filter definitions this runtime renders, metadata only. */
  "catalog.list": z.object({}).strict(),
  /** The connected Display Hosts, as in the live state, oldest connection first. */
  "displays.list": z.object({}).strict(),
  /**
   * Show an Output of the open Installation on a Display of a connected
   * Display Host. `host` is a host's id, or its name when only one connected
   * host has it; `display` a Display's id, or its label when only one of the
   * host's has it. Names and labels match ignoring case. Replaces what the
   * Display was showing. Resolves with the host's answer.
   */
  "displays.show": z
    .object({
      host: z.string().min(1),
      display: z.string().min(1),
      output: z.string().min(1),
    })
    .strict(),
  /** Stop showing an Output on that Display. */
  "displays.hide": z
    .object({ host: z.string().min(1), display: z.string().min(1) })
    .strict(),
} as const;

export type RuntimeRequestName = keyof typeof RuntimeRequestSchemas;
export type RuntimeRequestPayload<TName extends RuntimeRequestName> = z.infer<
  (typeof RuntimeRequestSchemas)[TName]
>;

/** Undo and redo are document commands handled by the session, not the registry. */
export const HISTORY_COMMANDS = {
  undo: "history.undo",
  redo: "history.redo",
} as const;

export const HistoryCommandPayloadSchema = z
  .object({ global: z.boolean().optional() })
  .strict();
