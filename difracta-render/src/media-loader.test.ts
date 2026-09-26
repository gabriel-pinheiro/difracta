import { id as brand } from "@difracta/core";
import { describe, expect, it } from "vitest";

import {
  MediaLoader,
  needsCrossOrigin,
  type MediaElements,
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

function loader(mediaUrl = (id: string): string | undefined => `/media/${id}`) {
  const images: FakeImage[] = [];
  const videos: FakeVideo[] = [];
  const elements: MediaElements = {
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
    mediaUrl,
    elements,
    pageOrigin: "http://tv.local:4801",
  });
  return { instance, images, videos };
}

const item = (id: string, path: string) => ({
  id: brand("media", id),
  kind: "file" as const,
  name: id,
  parentId: null,
  path,
  order: "a",
});

describe("MediaLoader", () => {
  it("loads every item of the table once, decodes images and preloads videos muted", () => {
    const { instance, images, videos } = loader();
    const table = {
      logo: item("logo", "logo.png"),
      clip: item("clip", "clip.webm"),
    };
    instance.sync(table);
    instance.sync(table); // the same revision costs nothing
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

  it("drops removed items, reloads a changed path and keeps the rest", () => {
    const { instance, images } = loader();
    instance.sync({ a: item("a", "a.png"), b: item("b", "b.png") });
    const a = instance.get("a");
    images[0]?.loadAs(8, 8);
    instance.sync({ a: item("a", "a.png"), b: item("b", "other.png") });
    expect(instance.get("a")).toBe(a);
    expect(a?.version).toBe(1);
    expect(images).toHaveLength(3);
    expect(images[1]?.src).toBe(""); // released
    expect(images[2]?.src).toBe("/media/b");
    instance.sync({ b: item("b", "other.png") });
    expect(instance.get("a")).toBeUndefined();
    expect(a?.version).toBe(0);
    expect(images[0]?.src).toBe("");
  });

  it("skips Groups and items with no URL or an extension it cannot show", () => {
    const { instance, images } = loader((id) =>
      id === "far" ? undefined : `/media/${id}`,
    );
    instance.sync({
      far: item("far", "far.png"),
      odd: item("odd", "odd.txt"),
      art: {
        id: brand("media", "art"),
        kind: "group",
        name: "Art",
        parentId: null,
        order: "a",
      },
    });
    expect(images).toHaveLength(0);
    expect(instance.get("art")).toBeUndefined();
    expect(instance.get("far")).toBeUndefined();
  });

  it("gives a Layer its own video playback over the same file, counting presented frames", () => {
    const { instance, videos } = loader();
    instance.sync({
      clip: item("clip", "clip.mp4"),
      pic: item("pic", "pic.jpg"),
    });
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

  it("asks for CORS only for a file on another origin", () => {
    const page = "http://tv.local:4801";
    expect(needsCrossOrigin("/media/a", page)).toBe(false);
    expect(needsCrossOrigin("http://tv.local:4801/media/a", page)).toBe(false);
    expect(needsCrossOrigin("http://stage:4800/media/a", page)).toBe(true);
    expect(needsCrossOrigin("data:image/png;base64,AA==", page)).toBe(false);
    expect(needsCrossOrigin("blob:http://tv.local:4801/x", page)).toBe(false);
    const { instance, images } = loader(
      (id) => `http://stage:4800/media/${id}`,
    );
    instance.sync({ a: item("a", "a.png") });
    expect(images[0]?.crossOrigin).toBe("anonymous");
  });
});
