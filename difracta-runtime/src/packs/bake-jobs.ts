import { settings, type FileMediaType, type ProxySize } from "@difracta/core";
import { z } from "zod";

/**
 * What one ffmpeg or ffprobe run does, as arguments. Pure, so the baker's
 * plans are tested without a binary. The thumbnail's settings and the
 * first proxy size's match the ones the Bundled Pack was baked with, so
 * every Pack's thumbnails and proxies look the same.
 */

/** Width, height and duration of the first video stream, as JSON. */
export function probeArgs(file: string): string[] {
  return [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height:format=duration",
    "-of",
    "json",
    file,
  ];
}

export interface Probe {
  readonly width: number;
  readonly height: number;
  /** Seconds; absent for an image. */
  readonly duration?: number;
}

const ProbeOutput = z.looseObject({
  streams: z
    .array(
      z.looseObject({
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
      }),
    )
    .optional(),
  format: z.looseObject({ duration: z.string().optional() }).optional(),
});

/** What ffprobe said, or undefined when it reported no picture size. */
export function parseProbe(
  stdout: string,
  type: FileMediaType,
): Probe | undefined {
  let json: unknown;
  try {
    json = JSON.parse(stdout);
  } catch {
    return undefined;
  }
  const parsed = ProbeOutput.safeParse(json);
  if (!parsed.success) return undefined;
  const stream = parsed.data.streams?.[0];
  if (stream?.width === undefined || stream.height === undefined)
    return undefined;
  const duration = Number.parseFloat(parsed.data.format?.duration ?? "");
  return {
    width: stream.width,
    height: stream.height,
    ...(type === "video" && Number.isFinite(duration) && duration > 0
      ? { duration }
      : {}),
  };
}

/** Where in a video the thumbnail is taken when its entry does not say. */
export function defaultThumbnailAt(duration: number | undefined): number {
  return duration === undefined
    ? 0
    : Math.round(duration * settings.packs.thumbnail.defaultAt * 1000) / 1000;
}

/** One frame at `at` seconds (none for an image), fitted inside the thumbnail size, WebP. */
export function thumbnailArgs(
  file: string,
  out: string,
  type: FileMediaType,
  at: number,
): string[] {
  const { width, height } = settings.packs.thumbnail;
  return [
    "-y",
    ...(type === "video" ? ["-ss", String(at)] : []),
    "-i",
    file,
    "-frames:v",
    "1",
    "-vf",
    `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
    "-c:v",
    "libwebp",
    "-quality",
    "80",
    out,
  ];
}

/** The video at the height of `size`, one of `settings.packs.proxy.sizes` (smaller sources keep theirs), at its bitrate, H.264, no audio, ready to stream. */
export function proxyArgs(
  file: string,
  out: string,
  { height, bitrateKbps }: Pick<ProxySize, "height" | "bitrateKbps">,
): string[] {
  return [
    "-y",
    "-i",
    file,
    "-an",
    "-vf",
    `scale=-2:'min(${height},ih)'`,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-b:v",
    `${bitrateKbps}k`,
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    out,
  ];
}
