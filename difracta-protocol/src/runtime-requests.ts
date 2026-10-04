import { settings, SLUG_PATTERN } from "@difracta/core";
import { z } from "zod";

/**
 * Runtime-scoped requests: the document, the Catalog, the Display Hosts,
 * the Screen Shares and the Packs.
 * These are not Document commands; they manage which Document the runtime
 * has open, read what the runtime is built with, or reach another
 * connection. Names and payload schemas live here so the runtime, Studio and
 * CLI agree.
 *
 * A connection whose `welcome` said `documents: "pinned"` is refused
 * `documents.new`, `documents.open`, `documents.close` and a
 * `documents.save` to another path, as well as `packs.add` and
 * `packs.locate`, which name folders on the runtime's disk.
 */
export const RuntimeRequestSchemas = {
  /**
   * Replaces the open document with a new, unsaved one: the starter
   * Installation (an Output, a Surface, a Scene and a Visual Layer), or no
   * entities at all when `blank`.
   */
  "documents.new": z
    .object({
      name: z.string().trim().min(1).max(120),
      /** Drop unsaved changes of the current document instead of failing. */
      discard: z.boolean().optional(),
      /** Start with no entities instead of the starter. */
      blank: z.boolean().optional(),
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
  /** The Visual and Filter definitions this runtime renders and its Bundled Fonts, metadata only. */
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
  /**
   * Stop the share of a Screen Share of the open Installation, by its id,
   * whoever shares into it. Its Sharer hears that it was stopped. Fails when
   * nobody shares into it.
   */
  "shares.stop": z.object({ mediaId: z.string().min(1) }).strict(),
  /**
   * Make a folder on the runtime's machine a Pack: scan it, write its
   * manifest, record it in the Registry and attach it to the open
   * Installation. Resolves with `{ packId, name }`. Loopback only.
   */
  "packs.add": z.object({ folder: z.string().min(1) }).strict(),
  /** The Packs the runtime's machine knows: `KnownPack[]`, by name. */
  "packs.known": z.object({}).strict(),
  /**
   * Say where a Pack the Installation attaches is on this machine: the
   * folder's manifest must carry `packId`. Writes the Registry and loads the
   * Pack. Loopback only.
   */
  "packs.locate": z
    .object({ packId: z.string().min(1), folder: z.string().min(1) })
    .strict(),
  /** Walk a loaded Pack's folder again: new files get entries, renamed ones re-attach, gone ones read missing. */
  "packs.rescan": z.object({ packId: z.string().min(1) }).strict(),
  /** Rename a Pack in its manifest and, when attached, in the Installation. Refused on a read-only Pack. */
  "packs.rename": z
    .object({
      packId: z.string().min(1),
      name: z.string().trim().min(1).max(120),
    })
    .strict(),
  /**
   * Change an entry's metadata in its Pack's manifest: name, tags, Beats
   * (null removes them and the first beat), first beat, the time of the
   * thumbnail's frame (re-baked), and the size and duration a browser
   * measured. Refused on a read-only Pack.
   */
  "media.update": z
    .object({
      packId: z.string().min(1),
      entryId: z.string().regex(SLUG_PATTERN),
      name: z.string().trim().min(1).max(120).optional(),
      tags: z.array(z.string().trim().min(1)).optional(),
      beats: z
        .number()
        .positive()
        .max(settings.media.maxBeats)
        .nullable()
        .optional(),
      firstBeat: z.number().nonnegative().optional(),
      thumbnailAt: z.number().nonnegative().optional(),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
      duration: z.number().positive().optional(),
    })
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
