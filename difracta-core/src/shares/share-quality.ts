import { settings } from "../settings.ts";

/**
 * What a Sharer sends, decided from `settings.shares.sharer` and what a
 * person picked when starting the share: Sharp or Smooth, and whether the
 * cursor shows. Pure, so the share window only hands these to the browser.
 */
export const SHARE_QUALITIES = ["sharp", "smooth"] as const;
export type ShareQuality = (typeof SHARE_QUALITIES)[number];

export interface PictureSize {
  readonly width: number;
  readonly height: number;
}

const largest = (): PictureSize => ({
  width: settings.shares.sharer.maxWidth,
  height: settings.shares.sharer.maxHeight,
});

/**
 * By how much a picture of `size` is divided to fit the largest one sent,
 * keeping its shape: 1 for one that fits, or whose size is not known.
 */
export function scaleDownBy(
  size: PictureSize,
  max: PictureSize = largest(),
): number {
  if (!(size.width > 0) || !(size.height > 0)) return 1;
  return Math.max(1, size.width / max.width, size.height / max.height);
}

/** The size a picture of `size` is sent at, whole pixels. */
export function sentSize(
  size: PictureSize,
  max: PictureSize = largest(),
): PictureSize {
  const by = scaleDownBy(size, max);
  return {
    width: Math.max(1, Math.round(size.width / by)),
    height: Math.max(1, Math.round(size.height / by)),
  };
}

/**
 * What the capture is asked for: the quality's frame rate, a picture no
 * larger than the largest sent (the browser scales a larger source down,
 * keeping its shape), and the cursor in the picture or never. A capturer
 * that draws the cursor whatever it is asked says so in the track's
 * settings, which is what the share window shows.
 */
export function captureConstraints(quality: ShareQuality, cursor: boolean) {
  const { maxWidth, maxHeight, qualities } = settings.shares.sharer;
  return {
    frameRate: { ideal: qualities[quality].frameRate },
    width: { max: maxWidth },
    height: { max: maxHeight },
    cursor: cursor ? "always" : "never",
  } as const;
}

/**
 * How one Viewer's picture is encoded, from the first frame on. `captured`
 * is the size the capture really has: a capturer that ignored the limit is
 * scaled down here.
 */
export function sendEncoding(quality: ShareQuality, captured: PictureSize) {
  const { maxBitrate, frameRate } = settings.shares.sharer.qualities[quality];
  return {
    maxBitrate,
    maxFramerate: frameRate,
    scaleResolutionDownBy: scaleDownBy(captured),
  };
}

/**
 * The codecs a connection offers, the quality's first in its order and
 * whatever else the browser has (retransmission, error correction, a codec
 * the settings do not name) after them, as the browser listed them.
 */
export function codecOrder<TCodec extends { readonly mimeType: string }>(
  available: readonly TCodec[],
  quality: ShareQuality,
): TCodec[] {
  const wanted: readonly string[] = settings.shares.sharer.qualities[
    quality
  ].codecs.map((codec) => codec.toLowerCase());
  const rank = (codec: TCodec): number => {
    const at = wanted.indexOf(codec.mimeType.toLowerCase());
    return at < 0 ? wanted.length : at;
  };
  return available
    .map((codec, index) => ({ codec, index }))
    .sort((a, b) => rank(a.codec) - rank(b.codec) || a.index - b.index)
    .map(({ codec }) => codec);
}
