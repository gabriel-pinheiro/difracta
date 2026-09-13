/**
 * The motion of a Pixel Bar packet, apart from any drawing: which pixel
 * along the bar is how bright at a given travel. Travel counts traversals
 * of the bar, so 1 is the far end. A trail is always allowed to finish
 * leaving the bar rather than being cut at its end.
 */
export type PixelBarDirection = "forward" | "reverse";
export type PixelBarEffect = "bounce" | "comet" | "scanner" | "split";

export interface PixelBarPixelInput {
  readonly direction: PixelBarDirection;
  readonly effect: PixelBarEffect;
  readonly pixelCount: number;
  readonly pixelIndex: number;
  readonly travel: number;
  /** Trail length in pixels behind the head. */
  readonly trail: number;
}

function trailAlpha(behind: number, trail: number): number {
  if (behind < 0 || behind > trail) return 0;
  return Math.pow(1 - behind / Math.max(1, trail + 1), 1.4);
}

/** The travel at which a packet of this effect has nothing left to show. */
export function pixelBarLifetime(
  effect: PixelBarEffect,
  pixelCount: number,
  trail: number,
): number {
  const count = Math.max(1, Math.round(pixelCount));
  const trailPixels = Math.max(0, Math.round(trail));
  switch (effect) {
    case "split":
      return 1 + trailPixels / Math.ceil(count / 2);
    case "bounce":
      return 2 + trailPixels / count;
    case "scanner":
      return 1;
    case "comet":
      return 1 + trailPixels / count;
  }
}

export function pixelBarPixelAlpha({
  direction,
  effect,
  pixelCount,
  pixelIndex,
  travel,
  trail,
}: PixelBarPixelInput): number {
  const count = Math.max(1, Math.round(pixelCount));
  const trailPixels = Math.max(0, Math.round(trail));
  if (pixelIndex < 0 || pixelIndex >= count || travel < 0) return 0;
  if (travel >= pixelBarLifetime(effect, count, trailPixels)) return 0;

  if (effect === "split") {
    const halfSpan = Math.ceil(count / 2);
    const headDistance = Math.floor(travel * halfSpan);
    const pixelDistance = Math.floor(Math.abs(pixelIndex - (count - 1) / 2));
    return trailAlpha(headDistance - pixelDistance, trailPixels);
  }

  const logicalIndex =
    direction === "forward" ? pixelIndex : count - pixelIndex - 1;
  if (effect === "bounce") {
    const returning = travel > 1;
    const headIndex = returning
      ? Math.floor((2 - travel) * count)
      : Math.min(count - 1, Math.floor(travel * count));
    const behind = returning
      ? logicalIndex - headIndex
      : headIndex - logicalIndex;
    return trailAlpha(behind, trailPixels);
  }

  const effectTrail = effect === "scanner" ? 0 : trailPixels;
  const headIndex = Math.floor(travel * count);
  return trailAlpha(headIndex - logicalIndex, effectTrail);
}
