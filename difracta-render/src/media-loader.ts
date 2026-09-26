import {
  emptyCatalog,
  mediaItemTypeIn,
  type Catalog,
  type Media,
  type MediaType,
  type Table,
} from "@difracta/core";

import {
  countVideoFrames,
  createMediaVideo,
  prepareVideoElement,
  videoHandle,
} from "./media-video.ts";
import type { MediaContext, MediaHandle, MediaVideo } from "./sdk/media.ts";

/**
 * The Output's Media, loaded ahead of use: on every document revision
 * `sync` gives each file and bundled item of the `media` table an element,
 * an image that decodes or a video that preloads, and drops the ones the
 * table lost or repointed, so
 * a Layer that starts showing an item finds it ready and nothing is
 * evicted while the Installation is open. Files come from `mediaUrl(id)`:
 * `/media/<id>` on the runtime for an Output page, a data URL in the
 * thumbnail harness. An item repointed to another file or entry is loaded
 * again under `?v=<n>`, since the browser keeps what it fetched per URL and
 * would otherwise show the old picture. Element creation is injected so the loader is tested
 * without a browser. A video's preloaded element is only ever shown as its
 * first frame; a Layer that plays it asks `video(id)` for an element of
 * its own over the same URL, which the browser serves from its cache.
 */
export interface MediaElements {
  image(): HTMLImageElement;
  video(): HTMLVideoElement;
}

export interface MediaLoaderOptions {
  /** Where the item's file is; undefined for one this page cannot reach. */
  readonly mediaUrl: (id: string) => string | undefined;
  /** Where a bundled item's type comes from; one whose entry it lacks is not loaded. */
  readonly catalog?: Catalog;
  readonly elements?: MediaElements;
  /** The page's origin, to decide when a file needs CORS; the browser's by default. */
  readonly pageOrigin?: string;
}

/** The `media` table, of which only what each item shows matters here; a Group shows nothing. */
export type MediaTable = Table<Media>;

interface Entry {
  /** What the item shows, `file:<path>` or `bundled:<entry id>`: a change reloads it. */
  readonly source: string;
  readonly type: MediaType;
  readonly url: string;
  readonly handle: MediaHandle;
  readonly release: () => void;
}

const sourceOf = (item: Media | undefined): string | undefined => {
  if (item?.kind === "file") return `file:${item.path}`;
  if (item?.kind === "bundled") return `bundled:${item.bundled}`;
  return undefined;
};

const DOM_ELEMENTS: MediaElements = {
  image: () => document.createElement("img"),
  video: () => document.createElement("video"),
};

/** `url` for the `loads`-th load of an item: the first as it is, later ones with `v=<n>`; data and blob URLs as they are. */
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

export class MediaLoader implements MediaContext {
  readonly #options: MediaLoaderOptions;
  readonly #elements: MediaElements;
  readonly #catalog: Catalog;
  readonly #pageOrigin: string;
  readonly #entries = new Map<string, Entry>();
  /** How many times each item was loaded, for the reload's URL. */
  readonly #loads = new Map<string, number>();
  #table: MediaTable | undefined;

  constructor(options: MediaLoaderOptions) {
    this.#options = options;
    this.#elements = options.elements ?? DOM_ELEMENTS;
    this.#catalog = options.catalog ?? emptyCatalog;
    this.#pageOrigin =
      options.pageOrigin ??
      (typeof location === "undefined" ? "null" : location.origin);
  }

  /** Brings the elements in step with the table; a table seen before costs nothing. */
  sync(media: MediaTable): void {
    if (media === this.#table) return;
    this.#table = media;
    for (const [id, entry] of this.#entries)
      if (sourceOf(media[id]) !== entry.source) {
        entry.release();
        this.#entries.delete(id);
      }
    for (const [id, item] of Object.entries(media)) {
      const source = sourceOf(item);
      if (source !== undefined && !this.#entries.has(id)) {
        const entry = this.#load(id, item, source);
        if (entry !== undefined) this.#entries.set(id, entry);
      }
    }
  }

  get(id: string): MediaHandle | undefined {
    return this.#entries.get(id)?.handle;
  }

  video(id: string): MediaVideo | undefined {
    const entry = this.#entries.get(id);
    if (entry?.type !== "video") return undefined;
    const element = this.#elements.video();
    prepareVideoElement(
      element,
      entry.url,
      needsCrossOrigin(entry.url, this.#pageOrigin),
    );
    return createMediaVideo(id, element);
  }

  dispose(): void {
    for (const entry of this.#entries.values()) entry.release();
    this.#entries.clear();
    this.#table = undefined;
  }

  #load(id: string, item: Media, source: string): Entry | undefined {
    const type = mediaItemTypeIn(item, this.#catalog);
    const base = this.#options.mediaUrl(id);
    if (type === undefined || base === undefined) return undefined;
    const loads = (this.#loads.get(id) ?? 0) + 1;
    this.#loads.set(id, loads);
    const url = withLoad(base, loads);
    const crossOrigin = needsCrossOrigin(url, this.#pageOrigin);
    return type === "image"
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
    const element = this.#elements.video();
    prepareVideoElement(element, url, crossOrigin);
    const frames = countVideoFrames(element);
    let alive = true;
    return {
      source,
      type: "video",
      url,
      handle: videoHandle(id, element, frames, () => alive),
      release() {
        alive = false;
        frames.stop();
        element.removeAttribute("src");
        element.load();
      },
    };
  }
}
