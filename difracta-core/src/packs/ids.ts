/**
 * The ids of Packs and their entries, and the shape of a fingerprint. All
 * pure, so Studio, the CLI and the runtime agree on what a slug is without
 * asking anyone.
 */

/** A slug: lowercase letters and digits, runs of them joined by single dashes. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const isSlug = (text: string): boolean => SLUG_PATTERN.test(text);

/**
 * `text` as a slug: lowercased, every run of anything but a letter or digit
 * turned into one dash, dashes at the ends dropped. Accented letters are
 * decomposed so "Café" slugs to "cafe". `fallback` when nothing is left.
 */
export function slugOf(text: string, fallback = "media"): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? fallback : slug;
}

/** `art/Logo.PNG` → `art/Logo`: a relative file path without its extension. */
export function withoutExtension(file: string): string {
  const slash = file.lastIndexOf("/");
  const dot = file.lastIndexOf(".");
  return dot > slash + 1 ? file.slice(0, dot) : file;
}

/**
 * An id `base` or, while `taken` has it, the first of `base-2`, `base-3`…
 * that it has not. Compared as written: ids are slugs already.
 */
export function uniqueId(base: string, taken: Iterable<string>): string {
  const existing = new Set(taken);
  if (!existing.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${String(suffix)}`;
    if (!existing.has(candidate)) return candidate;
  }
}

/**
 * The id of a Pack entry for the file at `file` (relative, POSIX): a slug
 * of its path without the extension, segments joined with dashes
 * (`tunnels/04.mp4` → `tunnels-04`), made unique among `taken` with a
 * numeric suffix. Assigned at first scan and never changed.
 */
export function entryIdFor(file: string, taken: Iterable<string>): string {
  const base = slugOf(withoutExtension(file).replaceAll("/", "-"));
  return uniqueId(base, taken);
}

/** How many characters of randomness a Pack id carries after its slug. */
export const PACK_ID_SUFFIX_LENGTH = 4;

const BASE36 = "abcdefghijklmnopqrstuvwxyz0123456789";

/** `PACK_ID_SUFFIX_LENGTH` lowercase base-36 characters from `random` (0 to 1, as `Math.random`). */
export function packIdSuffix(random: () => number = Math.random): string {
  let suffix = "";
  for (let index = 0; index < PACK_ID_SUFFIX_LENGTH; index += 1)
    suffix += BASE36.charAt(
      Math.floor(random() * BASE36.length) % BASE36.length,
    );
  return suffix;
}

/**
 * The id of a new Pack from its folder's name: its slug plus a short random
 * suffix (`neon-k7f3`), so two people each making a "neon" Pack never
 * collide. Assigned when the manifest is first written.
 */
export function packIdFor(
  folderName: string,
  random: () => number = Math.random,
): string {
  return `${slugOf(folderName, "pack")}-${packIdSuffix(random)}`;
}

/** The id of the Bundled Pack, the one every Installation has. */
export const BUNDLED_PACK_ID = "bundled";

/**
 * A fingerprint: the first 16 hex characters of the SHA-256 of the file's
 * first `settings.packs.fingerprintBytes` bytes, a dash, then its size in
 * bytes in base 36 (`3fa9c2e8b1d4a6f0-1k9z`). It keys an entry's thumbnail
 * and proxy and re-attaches an entry to a file renamed inside its Pack.
 */
export const FINGERPRINT_PATTERN = /^[0-9a-f]{16}-[0-9a-z]+$/;

/** How many hex characters of the hash a fingerprint keeps. */
export const FINGERPRINT_HASH_LENGTH = 16;

/** A fingerprint from the lowercase hex SHA-256 of the head and the file's size in bytes. */
export function formatFingerprint(sha256Hex: string, size: number): string {
  return `${sha256Hex.toLowerCase().slice(0, FINGERPRINT_HASH_LENGTH)}-${Math.max(0, Math.floor(size)).toString(36)}`;
}
