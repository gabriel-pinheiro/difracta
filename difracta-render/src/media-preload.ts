import { countVideoFrames } from "./media-video.ts";
import type { MediaHandle } from "./sdk/media.ts";

/**
 * A video item kept ready: one element preloaded to its first frame, and a
 * poster cut from that frame, which is what the item's shared handle shows.
 * A Layer that starts playing takes the warm element, so its first frame is
 * there at once, and a fresh element preloads in its place; the poster stays,
 * so a Layer showing the first frame is not disturbed by another one
 * playing the clip. Until the poster is cut the handle shows the first
 * element itself and nothing is handed over: without a way to cut one (no
 * `createImageBitmap`) every playback opens an element of its own.
 */
export interface VideoPreload {
  /** The item's shared picture: its first frame. */
  readonly handle: MediaHandle;
  /** The warm element, if it holds its first frame and the poster is cut; the caller owns it from then on. */
  take(): HTMLVideoElement | undefined;
  release(): void;
}

export type CutPoster = (element: HTMLVideoElement) => Promise<ImageBitmap>;

export function createVideoPreload(
  id: string,
  element: () => HTMLVideoElement,
  cutPoster: CutPoster | undefined,
): VideoPreload {
  let alive = true;
  let poster: ImageBitmap | undefined;
  let width = 0;
  let height = 0;
  let warm = element();
  /** The element the handle shows until the poster is cut; none once it was handed over. */
  let first: HTMLVideoElement | undefined = warm;
  let frames = countVideoFrames(warm, () => {
    if (poster !== undefined || width > 0) return;
    const shown = warm;
    width = shown.videoWidth;
    height = shown.videoHeight;
    cutPoster?.(shown).then(
      (bitmap) => {
        if (alive) poster = bitmap;
        else bitmap.close();
      },
      // A frame that cannot be cut leaves the element as the picture.
      () => undefined,
    );
  });
  return {
    handle: {
      id,
      get image() {
        if (!alive) return null;
        if (poster !== undefined) return poster;
        return first !== undefined && frames.version() > 0 ? first : null;
      },
      get width() {
        return width;
      },
      get height() {
        return height;
      },
      get version() {
        if (!alive) return 0;
        if (poster !== undefined) return 2;
        return first !== undefined && frames.version() > 0 ? 1 : 0;
      },
    },
    take() {
      if (!alive || poster === undefined || frames.version() === 0)
        return undefined;
      const taken = warm;
      frames.stop();
      first = undefined;
      warm = element();
      frames = countVideoFrames(warm);
      return taken;
    },
    release() {
      if (!alive) return;
      alive = false;
      frames.stop();
      warm.removeAttribute("src");
      warm.load();
      poster?.close();
      poster = undefined;
    },
  };
}
