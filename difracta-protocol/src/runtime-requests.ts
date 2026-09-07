import { z } from "zod";

/**
 * Runtime-scoped requests: documents and files. These are not Document
 * commands; they manage which Documents the runtime has open. Names and
 * payload schemas live here so the runtime, Studio and CLI agree.
 */
export const RuntimeRequestSchemas = {
  "documents.list": z.object({}).strict(),
  "documents.new": z
    .object({ name: z.string().trim().min(1).max(120) })
    .strict(),
  "documents.open": z
    .object({
      /** Path relative to the runtime's projects directory, or absolute. */
      path: z.string().min(1),
      /** Load the newest autosave sidecar instead of the file. */
      recover: z.boolean().optional(),
    })
    .strict(),
  "documents.save": z
    .object({
      documentId: z.string().min(1),
      /** Save As: a new path relative to the projects directory, or absolute. */
      path: z.string().min(1).optional(),
    })
    .strict(),
  "documents.close": z
    .object({ documentId: z.string().min(1), discard: z.boolean().optional() })
    .strict(),
  "files.list": z.object({}).strict(),
} as const;

export type RuntimeRequestName = keyof typeof RuntimeRequestSchemas;
export type RuntimeRequestPayload<TName extends RuntimeRequestName> = z.infer<
  (typeof RuntimeRequestSchemas)[TName]
>;

export const FileEntrySchema = z
  .object({
    path: z.string(),
    name: z.string(),
    modifiedAt: z.number(),
    /** True when an autosave sidecar newer than the file exists next to it. */
    recoveryAvailable: z.boolean(),
  })
  .strict();
export type FileEntry = z.infer<typeof FileEntrySchema>;

/** Undo and redo are document commands handled by the session, not the registry. */
export const HISTORY_COMMANDS = {
  undo: "history.undo",
  redo: "history.redo",
} as const;

export const HistoryCommandPayloadSchema = z
  .object({ global: z.boolean().optional() })
  .strict();
