import type { MediaBeats } from "@difracta/core";

/**
 * How a Visual reaches Media. The engine loads every Pack entry the open
 * document names ahead of use; an instance asks `media.get(reference)` for
 * the shared picture, or `media.video(reference)` for a playback of its own,
 * and hands the handle back from `update` under `textures`, where the
 * engine binds it as `u_<name>` with `u_<name>_size`. A handle never
 * loads anything itself: `image` is null until the file is decoded, and
 * `version` counts the pictures behind it, once for an image and once per
 * decoded video frame, so an instance reports `changed` exactly when the
 * texture the engine would upload differs. `media.beats(id)` answers a
 * video's length in beats, for an instance that follows a tempo.
 * `media.live(id)` is a Screen Share as this Output receives it.
 */
export type MediaImage =
  | HTMLImageElement
  | ImageBitmap
  | HTMLVideoElement
  /** Text the engine rasterized (`sdk/text.ts`). */
  | HTMLCanvasElement
  | OffscreenCanvas;

export interface MediaHandle {
  /** The Media reference; a text picture's names what it shows. */
  readonly id: string;
  /** What to upload, or null while loading, missing or before the first frame. */
  readonly image: MediaImage | null;
  /** The picture's size in pixels; zero until known. */
  readonly width: number;
  readonly height: number;
  /** Zero while `image` is null; advances on every new picture behind it. */
  readonly version: number;
}

/**
 * One playback of a video item, owned by the instance that asked for it:
 * every Layer playing a video plays its own copy, since two may be at
 * different positions. It holds a video element, and so a decoder, until
 * it is disposed, so an instance opens one when it starts playing and
 * disposes it when it stops. It starts paused on the first frame. The
 * clock is the browser's, the one exception to
 * "integrate, never sample": the element decodes at its own rate and
 * `handle.version` advances as frames arrive. Always muted.
 */
export interface MediaVideo {
  readonly handle: MediaHandle;
  /** Plays on from the current position. */
  play(): void;
  /** Holds the current frame. */
  pause(): void;
  /** Returns to the first frame without changing whether it plays. */
  rewind(): void;
  /** The `playbackRate`. */
  setRate(rate: number): void;
  /** Where the playback is, in seconds of the clip. */
  readonly position: number;
  /** The clip's length in seconds; zero until the element knows it. */
  readonly duration: number;
  setLoop(loop: boolean): void;
  /** True once a non-looping playback reached its end. */
  readonly ended: boolean;
  /** Stops and releases the element; the handle stays null from then on. */
  dispose(): void;
}

/**
 * A Screen Share as the engine receives it, one per slot and shared by
 * every instance showing it, since a share has one picture. The engine
 * views the slot, negotiates and recovers; an instance only reads. The
 * handle's `image` is null until a frame of the share arrived and again
 * once nobody shares, and `version` advances per frame presented, which on
 * a still screen is seldom. `lost` says the picture in the handle is the
 * last one of a connection that dropped and has not come back: the
 * instance decides how long that frame is worth showing, counting `dt`.
 * The clock is the stream's, under the exception a video element has.
 */
export interface MediaLive {
  readonly handle: MediaHandle;
  readonly lost: boolean;
}

export interface MediaContext {
  /**
   * The item's shared picture: an image once decoded, or a video's first
   * frame; undefined when no entry has this reference (`""` included).
   */
  get(id: string): MediaHandle | undefined;
  /** A playback of the video entry, to dispose with the instance; undefined for anything else. */
  video(id: string): MediaVideo | undefined;
  /**
   * The entry's beats as they are now; undefined for one without them.
   * Asked every frame, so a change reaches a clip that is playing.
   */
  beats(id: string): MediaBeats | undefined;
  /**
   * The Screen Share as this Output receives it; undefined for
   * anything else, and where nothing views shares, as in a Preview.
   */
  live(id: string): MediaLive | undefined;
}

/** The handles an update hands the engine, by name: `{ media: handle }` binds `u_media` and `u_media_size`. */
export type Textures = Readonly<Record<string, MediaHandle>>;

/** A context with no Media at all: what a player runs with outside an Output. */
export const NO_MEDIA: MediaContext = {
  get: () => undefined,
  video: () => undefined,
  beats: () => undefined,
  live: () => undefined,
};
