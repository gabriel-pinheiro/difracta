import { settings, type FileMediaType, type MediaBeats } from "@difracta/core";

import {
  createPreloadQueue,
  type PreloadQueue,
  type PreloadTimers,
} from "./media-preload-queue.ts";
import {
  createVideoPreload,
  type CutPoster,
  type VideoPreload,
} from "./media-preload.ts";
import { createMediaVideo, prepareVideoElement } from "./media-video.ts";
import type { MediaContext, MediaHandle, MediaVideo } from "./sdk/media.ts";

/**
 * The Output's Media, loaded ahead of use: on every document revision
 * `sync` is given the sources in use, one per Media reference the document
 * names (`engine-media.ts`), and gives each an element, an image that
 * decodes or a video that preloads, and drops the ones no longer named, so
 * a Layer that starts showing an entry finds it ready and nothing is
 * evicted while the Installation is open. A source whose `url` or
 * `revision` changed is loaded again under `?v=<n>`, since the browser
 * keeps what it fetched per URL and would otherwise show the old picture.
 * Element creation is injected so the loader is tested without a browser.
 * A video is kept warm (see `media-preload.ts`): its shared handle shows
 * the first frame, and a Layer that plays it asks `video(id)` for a
 * playback of its own, which takes the warm element when it is ready and
 * otherwise opens one over the same URL, which the browser serves from its
 * cache. The preloads take turns (`media-preload-queue.ts`),
 * `settings.media.video.preloadBatch` loading at the same moment, and
 * `preload` starts the ones waiting, the references a planned Layer names
 * first. `videos()` counts the elements held, each of which holds a
 * decoder. `beats(id)` reads the sources, not what was loaded, so beats
 * written to an entry need no reload.
 */
export interface MediaElements {
  image(): HTMLImageElement;
  video(): HTMLVideoElement;
  /** Cuts a video's current frame into a picture of its own; the browser's `createImageBitmap` by default. */
  poster?: CutPoster | undefined;
}

/** The video elements an Output holds: every one of them, and the ones playing. */
export interface VideoCount {
  readonly players: number;
  readonly playing: number;
}

export interface MediaLoaderOptions {
  readonly elements?: MediaElements;
  /** The page's origin, to decide when a file needs CORS; the browser's by default. */
  readonly pageOrigin?: string;
  /** What times a stalled preload out; the browser's timers by default. */
  readonly timers?: PreloadTimers;
}

/** One image or video to keep loaded, under the Media reference that names it. */
export interface MediaSource {
  readonly type: FileMediaType;
  /** Where the file is: on the runtime for an Output page, a data URL in the thumbnail harness. */
  readonly url: string;
  /** What the file is, such as its fingerprint: a change under the same URL loads it again. */
  readonly revision?: string | undefined;
  /** The entry's beats as they are now; undefined for one without them. */
  readonly beats?: MediaBeats | undefined;
}

/** The sources in use, by Media reference. */
export type MediaSources = Readonly<Record<string, MediaSource>>;

interface Entry {
  /** The source's `url` and `revision`: a change reloads it. */
  readonly source: string;
  readonly type: FileMediaType;
  readonly url: string;
  readonly handle: MediaHandle;
  /** Set for a video: its warm element and poster. */
  readonly preload?: VideoPreload;
  readonly release: () => void;
}

const sourceOf = (source: MediaSource | undefined): string | undefined =>
  source === undefined ? undefined : `${source.url}|${source.revision ?? ""}`;

const DOM_ELEMENTS: MediaElements = {
  image: () => document.createElement("img"),
  video: () => document.createElement("video"),
  poster:
    typeof createImageBitmap === "function"
      ? (element) => createImageBitmap(element, { premultiplyAlpha: "none" })
      : undefined,
};

/** `url` for the `loads`-th load of a source: the first as it is, later ones with `v=<n>`; data and blob URLs as they are. */
export function withLoad(url: string, loads: number): string {
  if (loads <= 1 || url.startsWith("data:") || url.startsWith("blob:"))
    return url;
  return `${url}${url.includes("?") ? "&" : "?"}v=${String(loads)}`;
}

/** Whether a file at `url` is fetched from another origin than the page's; data and blob URLs are never. */
export function needsCrossOrigin(url: string, pageOrigin: string): boolean {
  if (url.startsWith("data:") || url.startsWith("blob:")) return false;
  try {
    return new URL(url, pageOrigin).origin !== pageOrigin;
  } catch {
    return false;
  }
}

export class MediaLoader implements Omit<MediaContext, "live"> {
  readonly #elements: MediaElements;
  readonly #pageOrigin: string;
  readonly #entries = new Map<string, Entry>();
  /** How many times each item was loaded, for the reload's URL. */
  readonly #loads = new Map<string, number>();
  /** The elements of the playbacks Layers hold, until each is disposed. */
  readonly #playbacks = new Set<HTMLVideoElement>();
  readonly #queue: PreloadQueue;
  #sources: MediaSources | undefined;

  constructor(options: MediaLoaderOptions = {}) {
    this.#elements = options.elements ?? DOM_ELEMENTS;
    this.#pageOrigin =
      options.pageOrigin ??
      (typeof location === "undefined" ? "null" : location.origin);
    this.#queue = createPreloadQueue({
      batch: settings.media.video.preloadBatch,
      stallMs: settings.media.video.preloadStallMs,
      timers: options.timers,
    });
  }

  /** Brings the elements in step with the sources; the same object seen before costs nothing. */
  sync(sources: MediaSources): void {
    if (sources === this.#sources) return;
    this.#sources = sources;
    for (const [id, entry] of this.#entries)
      if (sourceOf(sources[id]) !== entry.source) {
        entry.release();
        this.#entries.delete(id);
      }
    for (const [id, item] of Object.entries(sources)) {
      const source = sourceOf(item);
      if (source !== undefined && !this.#entries.has(id))
        this.#entries.set(id, this.#load(id, item, source));
    }
  }

  /**
   * Starts the video preloads waiting for a turn, as many as there are
   * turns free, the references `wanted` names first; `wanted` is only
   * asked while some wait.
   */
  preload(wanted: () => ReadonlySet<string>): void {
    if (this.#queue.waiting > 0) this.#queue.advance(wanted());
  }

  get(id: string): MediaHandle | undefined {
    return this.#entries.get(id)?.handle;
  }

  video(id: string): MediaVideo | undefined {
    const entry = this.#entries.get(id);
    if (entry?.type !== "video") return undefined;
    const element =
      entry.preload?.take() ??
      this.#videoElement(
        entry.url,
        needsCrossOrigin(entry.url, this.#pageOrigin),
      );
    this.#playbacks.add(element);
    return createMediaVideo(id, element, () => {
      this.#playbacks.delete(element);
    });
  }

  beats(id: string): MediaBeats | undefined {
    return this.#sources?.[id]?.beats;
  }

  videos(): VideoCount {
    let players = this.#playbacks.size;
    for (const entry of this.#entries.values())
      if (entry.preload?.held === true) players += 1;
    let playing = 0;
    for (const element of this.#playbacks)
      if (!element.paused && !element.ended) playing += 1;
    return { players, playing };
  }

  dispose(): void {
    for (const entry of this.#entries.values()) entry.release();
    this.#entries.clear();
    this.#sources = undefined;
  }

  #load(id: string, item: MediaSource, source: string): Entry {
    const loads = (this.#loads.get(id) ?? 0) + 1;
    this.#loads.set(id, loads);
    const url = withLoad(item.url, loads);
    const crossOrigin = needsCrossOrigin(url, this.#pageOrigin);
    return item.type === "image"
      ? this.#loadImage(id, source, url, crossOrigin)
      : this.#loadVideo(id, source, url, crossOrigin);
  }

  #loadImage(
    id: string,
    source: string,
    url: string,
    crossOrigin: boolean,
  ): Entry {
    const element = this.#elements.image();
    let version = 0;
    let alive = true;
    const ready = (): void => {
      if (alive) version = 1;
    };
    const loaded = (): void => {
      // Decoding ahead keeps the first upload from stalling a frame.
      if (typeof element.decode === "function")
        element.decode().then(ready, ready);
      else ready();
    };
    element.addEventListener("load", loaded);
    if (crossOrigin) element.crossOrigin = "anonymous";
    element.src = url;
    return {
      source,
      type: "image",
      url,
      handle: {
        id,
        get image() {
          return version > 0 ? element : null;
        },
        get width() {
          return element.naturalWidth;
        },
        get height() {
          return element.naturalHeight;
        },
        get version() {
          return version;
        },
      },
      release() {
        alive = false;
        version = 0;
        element.removeEventListener("load", loaded);
        element.removeAttribute("src");
      },
    };
  }

  #loadVideo(
    id: string,
    source: string,
    url: string,
    crossOrigin: boolean,
  ): Entry {
    const preload = createVideoPreload(
      id,
      () => this.#videoElement(url, crossOrigin),
      this.#elements.poster,
      this.#queue,
    );
    return {
      source,
      type: "video",
      url,
      handle: preload.handle,
      preload,
      release: () => {
        preload.release();
      },
    };
  }

  #videoElement(url: string, crossOrigin: boolean): HTMLVideoElement {
    const element = this.#elements.video();
    prepareVideoElement(element, url, crossOrigin);
    return element;
  }
}
