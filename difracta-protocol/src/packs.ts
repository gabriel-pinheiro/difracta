import { PackEntrySchema } from "@difracta/core";
import { z } from "zod";

/**
 * A Pack as the runtime has it loaded, under `["packs", packId]` in the
 * live state: the Bundled Pack and each Pack the open Installation attaches.
 * `status` is `loading` while the folder is scanned, `ok`, or `missing`
 * when neither the Registry nor the Installation's hint finds it. `folder`
 * is where it is on the runtime's disk, empty while missing. `warning`
 * names a limit the scan hit; `ffmpeg` says whether the runtime can bake
 * thumbnails and proxies; `prepared` counts the entries that have theirs.
 * Deltas are per property: a tag edit patches one entry's `tags`, baking
 * patches `prepared` and one entry's flags.
 */
export const PACK_STATUSES = ["loading", "ok", "missing"] as const;
export const PackStatusSchema = z.enum(PACK_STATUSES);
export type PackStatus = z.infer<typeof PackStatusSchema>;

export const ENTRY_STATUSES = ["ok", "missing"] as const;
export const EntryStatusSchema = z.enum(ENTRY_STATUSES);
export type EntryStatus = z.infer<typeof EntryStatusSchema>;

/** A manifest entry as loaded, with whether its file is there and what was baked for it. */
export const PackEntryLiveSchema = PackEntrySchema.extend({
  status: EntryStatusSchema,
  hasThumbnail: z.boolean(),
  hasProxy: z.boolean(),
}).strict();
export type PackEntryLive = z.infer<typeof PackEntryLiveSchema>;

export const PackLiveSchema = z
  .object({
    name: z.string(),
    readOnly: z.boolean(),
    status: PackStatusSchema,
    folder: z.string(),
    warning: z.string().optional(),
    ffmpeg: z.boolean(),
    prepared: z
      .object({
        done: z.number().int().nonnegative(),
        total: z.number().int().nonnegative(),
      })
      .strict(),
    entries: z.record(z.string(), PackEntryLiveSchema),
  })
  .strict();
export type PackLive = z.infer<typeof PackLiveSchema>;

/** One Pack the runtime's machine knows, as `packs.known` lists them. */
export const KnownPackSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    folder: z.string(),
    /** Whether the open Installation attaches it, so it is loaded. */
    loaded: z.boolean(),
  })
  .strict();
export type KnownPack = z.infer<typeof KnownPackSchema>;
