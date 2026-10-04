import { mediaTypeOf } from "@difracta/core";
import { describe, expect, it } from "vitest";

import {
  MediaLoader,
  needsCrossOrigin,
  withLoad,
  type MediaElements,
  type MediaSource,
} from "./media-loader.ts";

/**
 * Elements as the loader sees them, without a browser: each records what
 * it was set to and lets the test fire the events a real one would.
 */
class FakeElement {
  src = "";
  crossOrigin: string | null = null;
  readonly listeners = new Map<string, (() => void)[]>();
  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  removeEventListener(type: string, listener: () => void): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((l) => l !== listener),
    );
  }
  fire(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
  removeAttribute(name: string): void {
    if (name === "src") this.src = "";
  }
}

class FakeImage extends FakeElement {
  naturalWidth = 0;
  naturalHeight = 0;
  decoding = "";
  loadAs(width: number, height: number): void {
    this.naturalWidth = width;
    this.naturalHeight = height;
    this.fire("load");
  }
}

class FakeVideo extends FakeElement {
  preload = "";
  muted = false;
  playsInline = false;
  loop = false;
  playbackRate = 1;
  currentTime = 0;
  ended = false;
  paused = true;
  readyState = 0;
  videoWidth = 0;
  videoHeight = 0;
  loads = 0;
  #frameCallbacks = new Map<number, () => void>();
  #next = 1;
  requestVideoFrameCallback(callback: () => void): number {
    const handle = this.#next++;
    this.#frameCallbacks.set(handle, callback);
    return handle;
  }
  cancelVideoFrameCallback(handle: number): void {
    this.#frameCallbacks.delete(handle);
  }
  /** One frame presented, as the browser would report. */
  present(): void {
    const callbacks = [...this.#frameCallbacks.values()];
    this.#frameCallbacks.clear();
    for (const callback of callbacks) callback();
  }
  play(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
  load(): void {
    this.loads += 1;
  }
  loadAs(width: number, height: number): void {
    this.videoWidth = width;
    this.videoHeight = height;
    this.readyState = 2;
    this.fire("loadeddata");
  }
}

/** Timers the test fires by hand. */
function fakeTimers() {
  const pending = new Map<number, () => void>();
  let next = 1;
  return {
    pending,
    set(callback: () => void): unknown {
      pending.set(next, callback);
      return next++;
    },
    clear(timer: unknown): void {
      pending.delete(timer as number);
    },
    /** Every timer still pending runs out. */
    expire(): void {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const callback of callbacks) callback();
    },
  };
}

const NONE: ReadonlySet<string> = new Set();

function loader(poster?: MediaElements["poster"]) {
  const images: FakeImage[] = [];
  const videos: FakeVideo[] = [];
  const timers = fakeTimers();
  const elements: MediaElements = {
    poster,
    image: () => {
      const image = new FakeImage();
      images.push(image);
      return image as unknown as HTMLImageElement;
    },
    video: () => {
      const video = new FakeVideo();
      videos.push(video);
      return video as unknown as HTMLVideoElement;
    },
  };
  const instance = new MediaLoader({
    elements,
    pageOrigin: "http://tv.local:4801",
    timers,
  });
  return { instance, images, videos, timers };
}

/** A source served at `/media/<id>`, whose file is `path`: its type from the extension, the path as its revision. */
const item = (
  id: string,
  path: string,
  origin = "",
  beats?: MediaSource["beats"],
): MediaSource => ({
  type: mediaTypeOf(path) ?? "image",
  url: `${origin}/media/${id}`,
  revision: path,
  ...(beats === undefined ? {} : { beats }),
});

describe("MediaLoader", () => {
  it("loads every source once, decodes images and preloads videos muted", () => {
    const { instance, images, videos } = loader();
    const table = {
      logo: item("logo", "logo.png"),
      clip: item("clip", "clip.webm"),
    };
    instance.sync(table);
    instance.sync(table); // the same revision costs nothing
    expect(videos).toHaveLength(0); // a preload waits its turn
    instance.preload(() => NONE);
    expect(images).toHaveLength(1);
    expect(videos).toHaveLength(1);
    expect(images[0]?.src).toBe("/media/logo");
    expect(videos[0]).toMatchObject({
      src: "/media/clip",
      preload: "auto",
      muted: true,
      playsInline: true,
    });
    const logo = instance.get("logo");
    expect(logo).toMatchObject({ id: "logo", image: null, version: 0 });
    images[0]?.loadAs(64, 32);
    expect(logo).toMatchObject({ width: 64, height: 32, version: 1 });
    expect(logo?.image).toBe(images[0]);
    const clip = instance.get("clip");
    expect(clip?.image).toBeNull();
    videos[0]?.loadAs(128, 72);
    expect(clip).toMatchObject({ width: 128, height: 72, version: 1 });
    expect(instance.get("")).toBeUndefined();
    expect(instance.get("nope")).toBeUndefined();
  });

  it("drops removed sources, reloads a changed revision and keeps the rest", () => {
    const { instance, images } = loader();
    instance.sync({ a: item("a", "a.png"), b: item("b", "b.png") });
    const a = instance.get("a");
    images[0]?.loadAs(8, 8);
    instance.sync({ a: item("a", "a.png"), b: item("b", "other.png") });
    expect(instance.get("a")).toBe(a);
    expect(a?.version).toBe(1);
    expect(images).toHaveLength(3);
    expect(images[1]?.src).toBe(""); // released
    expect(images[2]?.src).toBe("/media/b?v=2");
    instance.sync({ b: item("b", "other.png") });
    expect(instance.get("a")).toBeUndefined();
    expect(a?.version).toBe(0);
    expect(images[0]?.src).toBe("");
  });

  it("answers a source's beats as the sources have them now, loading nothing again", () => {
    const { instance } = loader();
    const clip = item("clip", "clip.webm");
    instance.sync({
      clip,
      flash: item("flash", "flash.webm", "", { beats: 16, firstBeat: 0 }),
    });
    expect(instance.beats("clip")).toBeUndefined();
    expect(instance.beats("flash")).toEqual({ beats: 16, firstBeat: 0 });
    expect(instance.beats("nope")).toBeUndefined();
    const before = instance.get("clip");
    instance.sync({
      clip: { ...clip, beats: { beats: 8, firstBeat: 0.25 } },
    });
    expect(instance.beats("clip")).toEqual({ beats: 8, firstBeat: 0.25 });
    // Beats are not what the source shows: nothing is loaded again.
    expect(instance.get("clip")).toBe(before);
  });

  it("gives a Layer its own video playback over the same file, counting presented frames", () => {
    const { instance, videos } = loader();
    instance.sync({
      clip: item("clip", "clip.mp4"),
      pic: item("pic", "pic.jpg"),
    });
    instance.preload(() => NONE);
    expect(instance.video("pic")).toBeUndefined();
    const playback = instance.video("clip");
    expect(playback).toBeDefined();
    const element = videos[1];
    if (playback === undefined || element === undefined) throw new Error();
    expect(element.src).toBe("/media/clip");
    expect(element.muted).toBe(true);
    expect(playback.handle.image).toBeNull();
    element.loadAs(128, 72);
    expect(playback.handle).toMatchObject({ version: 1, width: 128 });
    expect(playback.handle.image).toBe(element);
    playback.play();
    expect(element.paused).toBe(false);
    element.present();
    element.present();
    expect(playback.handle.version).toBe(3);
    playback.setRate(2);
    playback.setLoop(true);
    expect(element).toMatchObject({ playbackRate: 2, loop: true });
    element.currentTime = 1.5;
    playback.rewind();
    expect(element.currentTime).toBe(0);
    element.ended = true;
    expect(playback.ended).toBe(true);
    playback.dispose();
    expect(element.paused).toBe(true);
    expect(element.src).toBe("");
    expect(element.loads).toBe(1);
    expect(playback.handle.image).toBeNull();
    expect(playback.handle.version).toBe(0);
    element.present(); // a late callback changes nothing
    expect(playback.handle.version).toBe(0);
  });

  it("hands a playback the warm element once the poster is cut, and warms another", async () => {
    const posters: { closed: boolean; close(): void }[] = [];
    const { instance, videos } = loader(() => {
      const poster = {
        closed: false,
        close() {
          poster.closed = true;
        },
      };
      posters.push(poster);
      return Promise.resolve(poster as unknown as ImageBitmap);
    });
    instance.sync({ clip: item("clip", "clip.webm") });
    instance.preload(() => NONE);
    const shared = instance.get("clip");
    const warm = videos[0];
    if (shared === undefined || warm === undefined) throw new Error();
    // Not loaded yet: a playback opens an element of its own.
    const cold = instance.video("clip");
    expect(videos).toHaveLength(2);
    expect(instance.videos()).toEqual({ players: 2, playing: 0 });
    cold?.dispose();
    expect(instance.videos()).toEqual({ players: 1, playing: 0 });
    warm.loadAs(128, 72);
    expect(shared).toMatchObject({ version: 1, width: 128, height: 72 });
    expect(shared.image).toBe(warm);
    await Promise.resolve();
    expect(shared.version).toBe(2);
    expect(shared.image).toBe(posters[0]);
    const playback = instance.video("clip");
    if (playback === undefined) throw new Error();
    // The warm element plays, already on its first frame; the one that
    // replaces it waits its turn, holding nothing.
    expect(videos).toHaveLength(2);
    expect(instance.videos()).toEqual({ players: 1, playing: 0 });
    instance.preload(() => NONE);
    expect(videos).toHaveLength(3);
    expect(playback.handle.image).toBe(warm);
    expect(playback.handle.version).toBe(1);
    expect(videos[2]).toMatchObject({ src: "/media/clip", preload: "auto" });
    expect(instance.get("clip")).toBe(shared);
    expect(shared.image).toBe(posters[0]);
    playback.play();
    expect(instance.videos()).toEqual({ players: 2, playing: 1 });
    // The next one is not loaded yet, so a second playback opens its own.
    const second = instance.video("clip");
    expect(videos).toHaveLength(4);
    expect(second?.handle.image).toBeNull();
    expect(instance.videos()).toEqual({ players: 3, playing: 1 });
    playback.dispose();
    second?.dispose();
    expect(warm.src).toBe("");
    expect(instance.videos()).toEqual({ players: 1, playing: 0 });
    instance.sync({});
    expect(videos[2]?.src).toBe("");
    expect(posters[0]?.closed).toBe(true);
    expect(shared).toMatchObject({ image: null, version: 0 });
    expect(instance.videos()).toEqual({ players: 0, playing: 0 });
  });

  function clips(count: number) {
    return Object.fromEntries(
      Array.from({ length: count }, (_, index) => {
        const id = `clip${String(index)}`;
        return [id, item(id, `${id}.webm`)];
      }),
    );
  }
  const sources = (videos: readonly FakeVideo[]) =>
    videos.map((video) => video.src.replace("/media/", ""));

  it("preloads videos four at a time, the next one when a turn ends", () => {
    const { instance, videos, timers } = loader();
    instance.sync(clips(7));
    expect(instance.videos().players).toBe(0);
    instance.preload(() => NONE);
    expect(sources(videos)).toEqual(["clip0", "clip1", "clip2", "clip3"]);
    expect(instance.videos().players).toBe(4);
    instance.preload(() => NONE); // no turn free: nothing starts
    expect(videos).toHaveLength(4);
    videos[1]?.loadAs(128, 72); // a first frame ends the turn
    expect(sources(videos).at(-1)).toBe("clip4");
    videos[0]?.fire("error"); // so does a file that fails
    expect(sources(videos).at(-1)).toBe("clip5");
    expect(videos).toHaveLength(6);
    timers.expire(); // and one that stalls
    expect(sources(videos).at(-1)).toBe("clip6");
    expect(videos).toHaveLength(7);
    expect(instance.videos().players).toBe(7);
    videos[2]?.loadAs(128, 72); // a turn ended by the timer ends once
    videos[6]?.loadAs(128, 72);
    expect(videos).toHaveLength(7);
    expect(timers.pending.size).toBe(0);
  });

  it("preloads the wanted items first, asking for them only while some wait", () => {
    const { instance, videos } = loader();
    instance.sync(clips(7));
    let asked = 0;
    const wanted = () => {
      asked += 1;
      return new Set(["clip5", "clip2", "nope"]);
    };
    instance.preload(wanted);
    expect(sources(videos)).toEqual(["clip2", "clip5", "clip0", "clip1"]);
    videos[0]?.loadAs(128, 72);
    videos[1]?.loadAs(128, 72);
    videos[2]?.loadAs(128, 72);
    expect(sources(videos).slice(4)).toEqual(["clip3", "clip4", "clip6"]);
    instance.preload(wanted);
    expect(asked).toBe(1);
  });

  it("never loads an item removed while it waits, and frees the turn of one removed while loading", () => {
    const { instance, videos } = loader();
    const table = clips(6);
    instance.sync(table);
    instance.preload(() => NONE);
    const { clip4: _waiting, clip0: _loading, ...rest } = table;
    instance.sync(rest);
    expect(videos[0]?.src).toBe(""); // released while loading
    expect(sources(videos).at(-1)).toBe("clip5"); // its turn went on
    for (const video of videos) if (video.src !== "") video.loadAs(128, 72);
    instance.preload(() => NONE);
    expect(sources(videos)).not.toContain("clip4");
    expect(instance.videos().players).toBe(4);
  });

  it("gives a Layer a player of its own while the preload waits its turn", () => {
    const { instance, videos } = loader();
    instance.sync(clips(5));
    instance.preload(() => NONE);
    const playback = instance.video("clip4");
    expect(sources(videos).at(-1)).toBe("clip4");
    expect(playback?.handle.image).toBeNull();
    expect(instance.videos().players).toBe(5);
    playback?.dispose();
    expect(instance.videos().players).toBe(4);
  });

  it("asks for CORS only for a file on another origin", () => {
    const page = "http://tv.local:4801";
    expect(needsCrossOrigin("/media/a", page)).toBe(false);
    expect(needsCrossOrigin("http://tv.local:4801/media/a", page)).toBe(false);
    expect(needsCrossOrigin("http://stage:4800/media/a", page)).toBe(true);
    expect(needsCrossOrigin("data:image/png;base64,AA==", page)).toBe(false);
    expect(needsCrossOrigin("blob:http://tv.local:4801/x", page)).toBe(false);
    const { instance, images } = loader();
    instance.sync({ a: item("a", "a.png", "http://stage:4800") });
    expect(images[0]?.crossOrigin).toBe("anonymous");
  });

  it("gives a reload a URL of its own, leaving data and blob URLs alone", () => {
    expect(withLoad("/media/a", 1)).toBe("/media/a");
    expect(withLoad("/media/a", 3)).toBe("/media/a?v=3");
    expect(withLoad("/media/a?x=1", 2)).toBe("/media/a?x=1&v=2");
    expect(withLoad("data:image/png;base64,AA==", 2)).toBe(
      "data:image/png;base64,AA==",
    );
  });
});
