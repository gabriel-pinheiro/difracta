import type { MediaHandle, MediaVideo } from "./sdk/media.ts";

/**
 * One playback of a video item over an element of its own (see
 * `sdk/media.ts`). The element is prepared here the way every video
 * element of the engine is: preloaded, muted (Chromium refuses unmuted
 * autoplay without a gesture, and an Output page gets none), inline, and
 * fetched with CORS credentials off when the file comes from another
 * origin, so the texture upload is not refused. `requestVideoFrameCallback`
 * advances the handle's version once per frame the browser presents, so a
 * paused video uploads nothing; without it, `timeupdate` stands in.
 */
export function prepareVideoElement(
  element: HTMLVideoElement,
  url: string,
  crossOrigin: boolean,
): void {
  element.preload = "auto";
  element.muted = true;
  element.playsInline = true;
  element.loop = false;
  if (crossOrigin) element.crossOrigin = "anonymous";
  element.src = url;
}

/** Whether the element has a frame to upload. */
const HAVE_CURRENT_DATA = 2;

interface FrameCounting {
  readonly version: () => number;
  readonly stop: () => void;
}

/** Counts presented frames on `element`, from the first decoded one on. */
export function countVideoFrames(
  element: HTMLVideoElement,
  onFrame?: () => void,
): FrameCounting {
  let version = 0;
  let callback: number | undefined;
  const advance = (): void => {
    if (element.readyState < HAVE_CURRENT_DATA) return;
    version += 1;
    onFrame?.();
  };
  const presented = (): void => {
    advance();
    callback = element.requestVideoFrameCallback(presented);
  };
  const listeners: (readonly [string, () => void])[] = [
    ["loadeddata", advance],
    ["seeked", advance],
  ];
  if (typeof element.requestVideoFrameCallback === "function")
    callback = element.requestVideoFrameCallback(presented);
  else listeners.push(["timeupdate", advance]);
  for (const [type, listener] of listeners)
    element.addEventListener(type, listener);
  return {
    version: () => version,
    stop() {
      for (const [type, listener] of listeners)
        element.removeEventListener(type, listener);
      if (callback !== undefined) element.cancelVideoFrameCallback(callback);
    },
  };
}

/** A handle over a video element: null until it has a frame, sized from its stream. */
export function videoHandle(
  id: string,
  element: HTMLVideoElement,
  frames: FrameCounting,
  alive: () => boolean = () => true,
): MediaHandle {
  return {
    id,
    get image() {
      return alive() && frames.version() > 0 ? element : null;
    },
    get width() {
      return element.videoWidth;
    },
    get height() {
      return element.videoHeight;
    },
    get version() {
      return alive() ? frames.version() : 0;
    },
  };
}

export function createMediaVideo(
  id: string,
  element: HTMLVideoElement,
): MediaVideo {
  let alive = true;
  const frames = countVideoFrames(element);
  return {
    handle: videoHandle(id, element, frames, () => alive),
    play() {
      if (!alive) return;
      // A play interrupted by a pause rejects; the element is muted, so
      // nothing else stands in the way, and either way there is no one to tell.
      element.play().catch(() => undefined);
    },
    pause() {
      if (alive) element.pause();
    },
    rewind() {
      if (alive) element.currentTime = 0;
    },
    setRate(rate) {
      if (alive && element.playbackRate !== rate) element.playbackRate = rate;
    },
    setLoop(loop) {
      if (alive && element.loop !== loop) element.loop = loop;
    },
    get ended() {
      return alive && element.ended;
    },
    dispose() {
      if (!alive) return;
      alive = false;
      frames.stop();
      element.pause();
      element.removeAttribute("src");
      element.load();
    },
  };
}
