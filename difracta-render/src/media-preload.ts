import type { PreloadQueue, PreloadTurn } from "./media-preload-queue.ts";
import { countVideoFrames, type FrameCounting } from "./media-video.ts";
import type { MediaHandle } from "./sdk/media.ts";

/**
 * A video item kept ready: one element preloaded to its first frame, and a
 * poster cut from that frame, which is what the item's shared handle shows.
 * A Layer that starts playing takes the warm element, so its first frame is
 * there at once, and a fresh element preloads in its place; the poster stays,
 * so a Layer showing the first frame is not disturbed by another one
 * playing the clip. Until the poster is cut the handle shows the first
 * element itself and nothing is handed over: without a way to cut one (no
 * `createImageBitmap`) every playback opens an element of its own. An
 * element is made when the queue gives the item its turn
 * (`media-preload-queue.ts`), the first one and every one that replaces a
 * taken one alike; while it waits the item holds no element, so no decoder.
 */
export interface VideoPreload {
  /** The item's shared picture: its first frame. */
  readonly handle: MediaHandle;
  /** The warm element, if it holds its first frame and the poster is cut; the caller owns it from then on. */
  take(): HTMLVideoElement | undefined;
  /** Whether it holds an element, loading or warm; none while it waits its turn. */
  readonly held: boolean;
  release(): void;
}

export type CutPoster = (element: HTMLVideoElement) => Promise<ImageBitmap>;

export function createVideoPreload(
  id: string,
  element: () => HTMLVideoElement,
  cutPoster: CutPoster | undefined,
  queue: PreloadQueue,
): VideoPreload {
  let alive = true;
  let poster: ImageBitmap | undefined;
  let width = 0;
  let height = 0;
  let warm: HTMLVideoElement | undefined;
  let frames: FrameCounting | undefined;
  let turn: PreloadTurn | undefined;
  /** The element the handle shows until the poster is cut; none once it was handed over. */
  let first: HTMLVideoElement | undefined;
  const cut = (shown: HTMLVideoElement): void => {
    if (poster !== undefined || width > 0) return;
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
  };
  const load = (initial: boolean): void => {
    turn = queue.request(id, () => {
      const made = element();
      warm = made;
      if (initial) first = made;
      frames = countVideoFrames(made, () => {
        cut(made);
      });
      return made;
    });
  };
  const shows = (): boolean =>
    first !== undefined && frames !== undefined && frames.version() > 0;
  load(true);
  return {
    handle: {
      id,
      get image() {
        if (!alive) return null;
        if (poster !== undefined) return poster;
        return shows() ? (first ?? null) : null;
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
        return shows() ? 1 : 0;
      },
    },
    take() {
      if (
        !alive ||
        poster === undefined ||
        warm === undefined ||
        frames === undefined ||
        frames.version() === 0
      )
        return undefined;
      const taken = warm;
      frames.stop();
      first = undefined;
      warm = undefined;
      frames = undefined;
      load(false);
      return taken;
    },
    get held() {
      return alive && warm !== undefined;
    },
    release() {
      if (!alive) return;
      alive = false;
      turn?.cancel();
      frames?.stop();
      if (warm !== undefined) {
        warm.removeAttribute("src");
        warm.load();
      }
      warm = undefined;
      poster?.close();
      poster = undefined;
    },
  };
}
