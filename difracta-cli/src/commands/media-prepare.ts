import { PROXY_HEIGHTS, wantedRendition } from "@difracta/core";
import type { PackEntryLive, PackLive } from "@difracta/protocol";

/** What `difracta media prepare` reads and says; pure, so it is tested without a runtime. */

/** What `media.prepare` answers: the proxy height being baked, or null when there is nothing to bake. */
export interface PrepareReply {
  readonly packId: string;
  readonly entryId: string;
  readonly baking: number | null;
}

/** `1080`, `1080p` or `4k` → a proxy height; anything that is not one of the sizes is an error. */
export function parseProxyHeight(text: string): number {
  const typed = text.trim().toLowerCase();
  const height = typed === "4k" ? 2160 : Number(typed.replace(/p$/, ""));
  if (!PROXY_HEIGHTS.includes(height))
    throw new Error(
      `A proxy is baked at ${PROXY_HEIGHTS.map(String).join(", ")} rows (4k is 2160); not “${text}”.`,
    );
  return height;
}

/** What `media prepare` says: the size being baked, or why nothing is. */
export function describePrepared(
  reference: string,
  height: number,
  baking: number | null,
  pack: Pick<PackLive, "readOnly" | "ffmpeg">,
  entry: Pick<
    PackEntryLive,
    "type" | "proxies" | "fingerprint" | "height" | "duration"
  >,
): string {
  if (baking !== null)
    return `${reference}: baking its ${String(baking)}p proxy${baking === height ? "" : ", the largest its original needs"}; \`difracta packs list\` says preparing until it is there.`;
  if (entry.type !== "video")
    return `${reference} is an image; only a video has proxies.`;
  const wanted = wantedRendition(entry, height);
  if (wanted === "original")
    return `${reference}: nothing to bake, its original plays at ${String(height)}p as it is.`;
  if (entry.proxies.includes(wanted))
    return `${reference}: nothing to bake, its ${String(wanted)}p proxy is there.`;
  if (pack.readOnly)
    return `${reference}: nothing is baked for a read-only Pack; it plays from what it ships.`;
  if (!pack.ffmpeg)
    return `${reference}: nothing is baked, the runtime's machine has no ffmpeg.`;
  return `${reference}: nothing to bake.`;
}
