import { describeBeats, type PackEntry } from "@difracta/core";

/**
 * An entry's size, length and beats as one line, "1920×1080, 7.1 s, 16
 * beats, 135.2 BPM", leaving out what is not known yet: a Pack scanned
 * without ffmpeg has no size or length until a browser loads the file.
 */
export function entryFacts(
  entry: Pick<PackEntry, "width" | "height" | "duration" | "beats">,
): string {
  const parts: string[] = [];
  if (entry.width !== undefined && entry.height !== undefined)
    parts.push(`${String(entry.width)}×${String(entry.height)}`);
  if (entry.duration !== undefined)
    parts.push(`${String(Math.round(entry.duration * 10) / 10)} s`);
  if (entry.beats !== undefined)
    parts.push(describeBeats(entry.beats, entry.duration));
  return parts.join(", ");
}
