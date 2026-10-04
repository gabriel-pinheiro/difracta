import { z } from "zod";

import { FILE_MEDIA_TYPES } from "../document/media.ts";
import { settings } from "../settings.ts";
import { FINGERPRINT_PATTERN, SLUG_PATTERN } from "./ids.ts";

/**
 * A Pack's manifest, `pack.json` in its `.difracta/` folder: the Pack's id
 * and name, whether it is read-only (the Bundled Pack is), and one entry
 * per image or video the runtime found in it. `version` is the schema's and
 * changes only when a shape does. An entry's `file` is relative to the
 * Pack's folder, POSIX, no segment starting with a dot. `width`, `height`
 * and `duration` are left out until ffmpeg or a browser has measured the
 * file. A video with a steady pulse says how many `beats` it lasts, and
 * `firstBeat`, the time in seconds of its first one, when that is not zero.
 * A missing file keeps its entry: missing is live status, never written.
 */
export const PACK_MANIFEST_VERSION = 1;

/** A relative POSIX path with no empty segment and none starting with a dot, so none is hidden, `.` or `..`: the rule the runtime's walk applies. */
export const PACK_FILE_PATTERN = /^[^./\0][^/\0]*(\/[^./\0][^/\0]*)*$/;

export const PackEntrySchema = z
  .object({
    id: z.string().regex(SLUG_PATTERN),
    file: z.string().regex(PACK_FILE_PATTERN),
    type: z.enum(FILE_MEDIA_TYPES),
    name: z.string().trim().min(1).max(120),
    description: z.string().optional(),
    notes: z.string().optional(),
    /** Free-form, trimmed, compared ignoring case; `loop`, `hit` and `recommended` are read by Difracta. */
    tags: z.array(z.string().trim().min(1)),
    fingerprint: z.string().regex(FINGERPRINT_PATTERN),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    /** In seconds; videos only. */
    duration: z.number().positive().optional(),
    /** The time in seconds of the frame the thumbnail shows; videos only. */
    thumbnailAt: z.number().nonnegative().optional(),
    beats: z.number().positive().max(settings.media.maxBeats).optional(),
    firstBeat: z.number().positive().optional(),
  })
  .strict();
export type PackEntry = z.infer<typeof PackEntrySchema>;

export const PackManifestSchema = z
  .object({
    version: z.literal(PACK_MANIFEST_VERSION),
    id: z.string().regex(SLUG_PATTERN),
    name: z.string().trim().min(1).max(120),
    readOnly: z.literal(true).optional(),
    entries: z.array(PackEntrySchema),
  })
  .strict()
  .refine(
    (manifest) =>
      new Set(manifest.entries.map((entry) => entry.id)).size ===
      manifest.entries.length,
    { message: "Every entry id is unique within the Pack." },
  );
export type PackManifest = z.infer<typeof PackManifestSchema>;

export type ParsedPackManifest =
  | { readonly ok: true; readonly manifest: PackManifest }
  | { readonly ok: false; readonly error: string };

/** A manifest read from disk, or why it is not one. */
export function parsePackManifest(json: unknown): ParsedPackManifest {
  const parsed = PackManifestSchema.safeParse(json);
  if (parsed.success) return { ok: true, manifest: parsed.data };
  return {
    ok: false,
    error: `The Pack manifest is not valid: ${z.prettifyError(parsed.error)}`,
  };
}

/** The tags Difracta reads: a seamless loop, a one-shot, a good default. */
export const KNOWN_TAGS = ["loop", "hit", "recommended"] as const;
export type KnownTag = (typeof KNOWN_TAGS)[number];

/** Whether an entry carries `tag`, compared ignoring case. */
export function hasTag(entry: Pick<PackEntry, "tags">, tag: string): boolean {
  const wanted = tag.trim().toLowerCase();
  return entry.tags.some((candidate) => candidate.toLowerCase() === wanted);
}
