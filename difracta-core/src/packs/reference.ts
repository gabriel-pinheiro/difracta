import { isSlug } from "./ids.ts";

/**
 * A Media reference is what a `media` Parameter holds: `<packId>/<entryId>`
 * for an image or video entry of a Pack, a Screen Share's id for a live
 * one, or `""` for none. Core checks the shape only; whether the entry
 * exists, is of the accepted type and has its file is live status the
 * runtime computes.
 */
export interface MediaReference {
  readonly packId: string;
  readonly entryId: string;
}

/** `<packId>/<entryId>` with exactly one slash and a slug on each side, or undefined. */
export function parseMediaReference(
  value: unknown,
): MediaReference | undefined {
  if (typeof value !== "string") return undefined;
  const parts = value.split("/");
  if (parts.length !== 2) return undefined;
  const [packId = "", entryId = ""] = parts;
  if (!isSlug(packId) || !isSlug(entryId)) return undefined;
  return { packId, entryId };
}

export const isMediaReference = (value: unknown): boolean =>
  parseMediaReference(value) !== undefined;

/** The reference to `entryId` of `packId`. */
export const mediaReference = (packId: string, entryId: string): string =>
  `${packId}/${entryId}`;
