/**
 * How a Visual reaches the Installation's Media. The engine loads every
 * item of the open document ahead of use; an instance asks `media.get(id)`
 * for the shared picture, or `media.video(id)` for a playback of its own,
 * and hands the handle back from `update` under `textures`, where the
 * engine binds it as `u_<name>` with `u_<name>_size`. A handle never
 * loads anything itself: `image` is null until the file is decoded, and
 * `version` counts the pictures behind it, once for an image and once per
 * decoded video frame, so an instance reports `changed` exactly when the
 * texture the engine would upload differs.
 */
export type MediaImage = HTMLImageElement | ImageBitmap | HTMLVideoElement;

export interface MediaHandle {
  /** The Media item's id. */
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
 * every Layer showing a video plays its own copy, since two may be at
 * different positions. The clock is the browser's, the one exception to
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
  setLoop(loop: boolean): void;
  /** True once a non-looping playback reached its end. */
  readonly ended: boolean;
  /** Stops and releases the element; the handle stays null from then on. */
  dispose(): void;
}

export interface MediaContext {
  /**
   * The item's shared picture: an image once decoded, or a video's
   * preloaded element showing its first frame; undefined when no item has
   * this id (`""` included).
   */
  get(id: string): MediaHandle | undefined;
  /** A playback of the video item, to dispose with the instance; undefined for anything else. */
  video(id: string): MediaVideo | undefined;
}

/** The handles an update hands the engine, by name: `{ media: handle }` binds `u_media` and `u_media_size`. */
export type Textures = Readonly<Record<string, MediaHandle>>;

/** A context with no Media at all: what a player runs with outside an Output. */
export const NO_MEDIA: MediaContext = {
  get: () => undefined,
  video: () => undefined,
};
