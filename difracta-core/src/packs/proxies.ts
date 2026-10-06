import { settings } from "../settings.ts";
import type { PackEntry } from "./manifest.ts";

/**
 * Which file a video plays from. A video entry has its original file and
 * proxies, smaller copies the runtime bakes at the heights of
 * `settings.packs.proxy.sizes`: the first for every video, the others when
 * something plays the video at that size. A Layer's Resolution says what
 * it wants: Original, one of the sizes, or Auto, the size its Target takes
 * on the Output drawing it. `wantedRendition` turns that into the file the
 * entry should play from, `playableRendition` into the one to play while
 * that is not baked yet. Pure, so the runtime that bakes and the pages
 * that play agree.
 */

/** A file of a video entry: its own, or its proxy of a height. */
export type Rendition = "original" | number;

export const PROXY_HEIGHTS: readonly number[] = settings.packs.proxy.sizes.map(
  (size) => size.height,
);

/** The proxy every video has once its Pack is Prepared. */
export const BASE_PROXY_HEIGHT = settings.packs.proxy.sizes[0].height;

/** The largest proxy size. */
const TALLEST_PROXY_HEIGHT = Math.max(...PROXY_HEIGHTS);

export type ProxySize = (typeof settings.packs.proxy.sizes)[number];

/** The proxy size of exactly `height`, when there is one. */
export function proxySize(height: number): ProxySize | undefined {
  return settings.packs.proxy.sizes.find((size) => size.height === height);
}

export const RESOLUTION_AUTO = "auto";
export const RESOLUTION_ORIGINAL = "original";

/** The options of a Resolution Parameter: Auto, Original, then the proxy sizes, largest first. */
export const RESOLUTION_OPTIONS: readonly {
  readonly value: string;
  readonly label: string;
}[] = [
  { value: RESOLUTION_AUTO, label: "Auto" },
  { value: RESOLUTION_ORIGINAL, label: "Original" },
  ...settings.packs.proxy.sizes
    .map((size) => ({
      value: String(size.height),
      label: size.height === 2160 ? "4K" : `${String(size.height)}p`,
    }))
    .reverse(),
];

/** What a Resolution Parameter's value asks for; anything unknown is Auto. */
export function parseResolution(value: unknown): Rendition | "auto" {
  if (value === RESOLUTION_ORIGINAL) return "original";
  const height = Number(value);
  return typeof value === "string" && proxySize(height) !== undefined
    ? height
    : "auto";
}

/**
 * The proxy size Auto takes for a picture drawn over `rows` pixel rows:
 * the smallest that covers them when stretched by
 * `settings.packs.proxy.upscale`, else the largest.
 */
export function autoProxyHeight(rows: number): number {
  const { sizes, upscale } = settings.packs.proxy;
  for (const size of sizes)
    if (size.height * upscale >= rows) return size.height;
  return TALLEST_PROXY_HEIGHT;
}

/** What the choice needs of an entry: its size, length and fingerprint, which carries the file's size. */
export type RenditionEntry = Pick<
  PackEntry,
  "fingerprint" | "height" | "duration"
>;

/** The entry's file size in bytes, as its fingerprint records it. */
export function entryBytes(entry: Pick<PackEntry, "fingerprint">): number {
  const size = Number.parseInt(entry.fingerprint.split("-")[1] ?? "", 36);
  return Number.isFinite(size) ? size : 0;
}

/** The entry's bitrate in kbit/s, audio included; undefined until its duration is measured. */
export function entryBitrateKbps(entry: RenditionEntry): number | undefined {
  if (entry.duration === undefined) return undefined;
  return (entryBytes(entry) * 8) / entry.duration / 1000;
}

/**
 * The file an entry asked for at `requested` should play from. Original is
 * the original. A size is first brought down to the smallest proxy size
 * that holds the original, since nothing larger is ever baked; the
 * original then serves it when it is no taller than that size and within
 * its bitrate budget, and otherwise the proxy of that size does, which for
 * an original of that height is the same picture at a bitrate a decoder
 * keeps up with. An entry not measured yet plays its original.
 */
export function wantedRendition(
  entry: RenditionEntry,
  requested: Rendition,
): Rendition {
  if (requested === "original" || entry.height === undefined) return "original";
  const { sizes } = settings.packs.proxy;
  const holding =
    sizes.find((size) => size.height >= (entry.height ?? 0))?.height ??
    TALLEST_PROXY_HEIGHT;
  const size = proxySize(Math.min(requested, holding));
  if (size === undefined) return "original";
  const bitrate = entryBitrateKbps(entry);
  const fits =
    entry.height <= size.height &&
    (bitrate === undefined || bitrate <= size.budgetKbps);
  return fits ? "original" : size.height;
}

/**
 * The file to play when `wanted` is asked for and only the proxies of
 * `baked` heights exist. While the size is on its way (`coming`): `wanted`
 * when it is there, else the largest proxy below it, else the smallest
 * above it, else the original, so waiting never costs more than the size
 * asked. When no bake will bring it (a read-only Pack, a runtime without
 * ffmpeg): the smallest proxy above it, else the original, so the picture
 * is never left below what was asked.
 */
export function playableRendition(
  wanted: Rendition,
  baked: readonly number[],
  coming = true,
): Rendition {
  if (wanted === "original" || baked.includes(wanted)) return wanted;
  const below = baked.filter((height) => height < wanted);
  if (coming && below.length > 0) return Math.max(...below);
  const above = baked.filter((height) => height > wanted);
  return above.length > 0 ? Math.min(...above) : "original";
}
