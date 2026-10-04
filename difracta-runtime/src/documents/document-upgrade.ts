import { ShareSchema, type Document } from "@difracta/core";
import { z } from "zod";

/**
 * What a format 1 file's `media` table still gives: its Screen Shares, the
 * items of kind `share` at the root, as entries of the `shares` table with
 * their name and order. Files, bundled items and Groups are dropped; the
 * Parameters that held them keep their ids and read as not found.
 */
const OldShareSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal("share"),
    name: z.string().trim().min(1).max(120),
    parentId: z.string().nullable().optional(),
    order: z.string().min(1).optional(),
  })
  .loose();

export function sharesFromMedia(
  media: Readonly<Record<string, unknown>> | undefined,
): Document["shares"] {
  if (media === undefined) return {};
  const shares: Record<string, Document["shares"][string]> = {};
  for (const item of Object.values(media)) {
    const parsed = OldShareSchema.safeParse(item);
    if (!parsed.success || (parsed.data.parentId ?? null) !== null) continue;
    const share = ShareSchema.parse({
      id: parsed.data.id,
      name: parsed.data.name,
      ...(parsed.data.order === undefined ? {} : { order: parsed.data.order }),
    });
    shares[share.id] = share as Document["shares"][string];
  }
  return shares;
}
