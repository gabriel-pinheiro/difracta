import { z } from "zod";

import { MEDIA_TYPES } from "../document/media.ts";
import type { MediaDefinition } from "./catalog.ts";

/**
 * The manifest of the Bundled Media, `manifest.json` at the root of a
 * difracta-media release: one entry per clip. `version` is the schema's and
 * changes only when an entry's shape does. A flag is present and `true`, or
 * left out. `file` is relative to the bundle's folder.
 */
export const BundleEntrySchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    name: z.string().min(1),
    description: z.string().min(1),
    notes: z.string().min(1),
    /** Segments start with a letter or digit, so none is `.` or `..`. */
    file: z.string().regex(/^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*$/),
    type: z.enum(MEDIA_TYPES),
    recommended: z.literal(true).optional(),
    loop: z.literal(true).optional(),
    hit: z.literal(true).optional(),
    /** The time in seconds of the frame the thumbnail shows. */
    thumbnailAt: z.number().nonnegative(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    duration: z.number().positive().optional(),
  })
  .strict();

export const BundleManifestSchema = z
  .object({ version: z.literal(1), items: z.array(BundleEntrySchema) })
  .strict();

/** The Catalog's `media` definitions from a manifest; throws, naming the problem, on one that does not match the schema. */
export function mediaDefinitionsFromManifest(
  manifest: unknown,
): MediaDefinition[] {
  const parsed = BundleManifestSchema.safeParse(manifest);
  if (!parsed.success)
    throw new Error(
      `The Bundled Media manifest is not valid: ${z.prettifyError(parsed.error)}`,
    );
  return parsed.data.items.map((entry) => ({
    kind: "media",
    id: entry.id,
    name: entry.name,
    description: entry.description,
    notes: entry.notes,
    type: entry.type,
    file: entry.file,
    width: entry.width,
    height: entry.height,
    ...(entry.recommended === true ? { recommended: true } : {}),
    ...(entry.loop === true ? { loop: true } : {}),
    ...(entry.hit === true ? { hit: true } : {}),
    ...(entry.duration === undefined ? {} : { duration: entry.duration }),
  }));
}
