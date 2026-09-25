import {
  createShaderPlayer,
  type MediaContext,
  type MediaHandle,
  type MediaVideo,
  type ShaderVisual,
} from "@difracta/render/sdk";
import { describe, expect, it } from "vitest";

import { image } from "./image.ts";
import { video } from "./video.ts";

const DT = 1 / 60;

/** A handle the test loads and advances by hand. */
interface FakeHandle extends Omit<MediaHandle, "version"> {
  version: number;
}

function fakeHandle(id: string): FakeHandle {
  const handle: FakeHandle = {
    id,
    version: 0,
    width: 16,
    height: 9,
    get image() {
      return handle.version > 0 ? ({} as unknown as HTMLImageElement) : null;
    },
  };
  return handle;
}

/** A playback that records the transport calls it gets; rate and loop only when they change, like the element's. */
function fakeVideo(id: string) {
  const handle = fakeHandle(id);
  const calls: string[] = [];
  let ended = false;
  let rate = 1;
  let loop = false;
  const playback: Omit<MediaVideo, "handle"> & {
    handle: FakeHandle;
    calls: string[];
    end(): void;
  } = {
    handle,
    calls,
    play: () => calls.push("play"),
    pause: () => calls.push("pause"),
    rewind: () => calls.push("rewind"),
    setRate: (next) => {
      if (next !== rate) calls.push(`rate ${next}`);
      rate = next;
    },
    setLoop: (next) => {
      if (next !== loop) calls.push(`loop ${next}`);
      loop = next;
    },
    get ended() {
      return ended;
    },
    end: () => {
      ended = true;
    },
    dispose: () => calls.push("dispose"),
  };
  return playback;
}

function context(
  handles: Record<string, MediaHandle> = {},
  videos: Record<string, () => MediaVideo> = {},
): MediaContext {
  return {
    get: (id) => handles[id],
    video: (id) => videos[id]?.(),
  };
}

function shader(visual: ShaderVisual, media: MediaContext) {
  const player = createShaderPlayer(visual, {
    width: 320,
    height: 180,
    seed: "test",
    media,
  });
  return {
    cue: (key: string) => player.cue(key),
    hide: () => player.hide(),
    dispose: () => player.dispose(),
    frame: (values: Record<string, unknown> = {}) =>
      player.frame(DT, values as never, 320, 180),
  };
}

describe("Image", () => {
  it("is blank without a picture, shows it once decoded and changes only with it", () => {
    const logo = fakeHandle("logo");
    const { frame } = shader(image, context({ logo }));
    expect(frame()).toMatchObject({ blank: true, textures: {} });
    const waiting = frame({ media: "logo" });
    expect(waiting).toMatchObject({ blank: true, textures: { media: logo } });
    expect(frame({ media: "logo" }).changed).toBe(false);
    logo.version = 1;
    const shown = frame({ media: "logo" });
    expect(shown).toMatchObject({ blank: false, changed: true });
    expect(frame({ media: "logo" }).changed).toBe(false);
    expect(frame({ media: "logo", fit: "cover" }).changed).toBe(true);
    expect(frame({ media: "" })).toMatchObject({ blank: true, changed: true });
  });
});

describe("Video", () => {
  function stage(values: Record<string, unknown> = {}) {
    const clip = fakeVideo("clip");
    const player = shader(video, context({}, { clip: () => clip }));
    const frame = (more: Record<string, unknown> = {}) =>
      player.frame({ media: "clip", ...values, ...more });
    return { ...player, frame, clip };
  }

  it("autoplays from the first frame when planned and reports frames as they arrive", () => {
    const { frame, clip } = stage();
    const first = frame();
    expect(clip.calls).toEqual(["rewind", "play", "loop true"]);
    expect(first).toMatchObject({ blank: true, changed: true });
    clip.handle.version = 1;
    expect(frame()).toMatchObject({ blank: false, changed: true });
    expect(frame().changed).toBe(false);
    clip.handle.version = 2;
    expect(frame().changed).toBe(true);
  });

  it("waits stopped with autoplay off, hidden or showing its first frame", () => {
    const hidden = stage({ autoplay: false });
    hidden.frame();
    expect(hidden.clip.calls).toEqual(["loop true"]);
    hidden.clip.handle.version = 1;
    expect(hidden.frame().blank).toBe(true);
    const still = stage({ autoplay: false, hideOnStop: false });
    still.clip.handle.version = 1;
    expect(still.frame().blank).toBe(false);
  });

  it("follows play, pause and stop as the transport says", () => {
    const { frame, cue, clip } = stage({ autoplay: false });
    frame();
    clip.handle.version = 1;
    clip.calls.length = 0;
    cue("play"); // stopped → playing, from the start
    expect(frame().blank).toBe(false);
    expect(clip.calls).toEqual(["rewind", "play"]);
    clip.calls.length = 0;
    cue("pause"); // playing → paused, the frame held
    frame();
    expect(clip.calls).toEqual(["pause"]);
    expect(frame().blank).toBe(false);
    clip.calls.length = 0;
    cue("pause"); // paused stays paused
    cue("play"); // paused → playing, resuming
    frame();
    expect(clip.calls).toEqual(["play"]);
    clip.calls.length = 0;
    cue("play"); // playing → restarts
    frame();
    expect(clip.calls).toEqual(["rewind", "play"]);
    clip.calls.length = 0;
    cue("stop"); // → stopped, at the start, hidden
    expect(frame().blank).toBe(true);
    expect(clip.calls).toEqual(["pause", "rewind"]);
    clip.calls.length = 0;
    cue("pause"); // stopped stays stopped
    frame();
    expect(clip.calls).toEqual([]);
  });

  it("lands in stopped when a playback without Loop ends", () => {
    const { frame, clip } = stage({ loop: false });
    frame();
    clip.handle.version = 1;
    expect(frame().blank).toBe(false);
    clip.calls.length = 0;
    clip.end();
    expect(frame()).toMatchObject({ blank: true, changed: true });
    expect(clip.calls).toEqual(["pause", "rewind"]);
    const shown = stage({ loop: false, hideOnStop: false });
    shown.frame();
    shown.clip.handle.version = 1;
    shown.clip.end();
    expect(shown.frame().blank).toBe(false);
  });

  it("applies Speed and Loop live", () => {
    const { frame, clip } = stage();
    frame();
    clip.calls.length = 0;
    frame({ speed: 2, loop: false });
    expect(clip.calls).toEqual(["rate 2", "loop false"]);
  });

  it("pauses the element while the Layer is hidden and resumes it when shown", () => {
    const { frame, hide, cue, clip } = stage();
    frame();
    clip.calls.length = 0;
    hide();
    expect(clip.calls).toEqual(["pause"]);
    clip.calls.length = 0;
    frame();
    expect(clip.calls).toEqual(["play"]);
    cue("pause");
    clip.calls.length = 0;
    hide(); // paused already: nothing to pause
    frame();
    expect(clip.calls).toEqual([]);
  });

  it("swaps the playback when the Media Parameter changes and disposes with the Layer", () => {
    const first = fakeVideo("one");
    const second = fakeVideo("two");
    const player = shader(
      video,
      context({}, { one: () => first, two: () => second }),
    );
    player.frame({ media: "one" });
    player.frame({ media: "two", autoplay: false });
    expect(first.calls).toContain("dispose");
    expect(second.calls).toEqual(["loop true"]);
    expect(player.frame({ media: "" })).toMatchObject({ blank: true });
    expect(second.calls).toContain("dispose");
    player.frame({ media: "one" });
    player.dispose();
    expect(first.calls.filter((call) => call === "dispose")).toHaveLength(2);
  });
});
