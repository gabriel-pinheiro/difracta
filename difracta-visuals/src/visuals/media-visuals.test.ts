import type { MediaHandle, MediaVideo } from "@difracta/render/sdk";
import { describe, expect, it } from "vitest";

import { image } from "./image.ts";
import {
  context,
  fakeHandle,
  fakeVideo,
  shader,
  stage,
} from "./media-fakes.ts";
import { video } from "./video.ts";

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
    expect(frame({ media: "logo", fit: "stretch" }).changed).toBe(true);
    expect(frame({ media: "" })).toMatchObject({ blank: true, changed: true });
  });
});

describe("Video", () => {
  it("autoplays from the first frame when planned and reports frames as they arrive", () => {
    const { frame, clip } = stage();
    const first = frame();
    expect(clip().calls).toEqual(["play", "loop true"]);
    expect(first).toMatchObject({ blank: true, changed: true });
    clip().handle.version = 1;
    expect(frame()).toMatchObject({ blank: false, changed: true });
    expect(frame().changed).toBe(false);
    clip().handle.version = 2;
    expect(frame().changed).toBe(true);
  });

  it("waits stopped with autoplay off, holding no playback, hidden or showing the first frame", () => {
    const hidden = stage({ autoplay: false });
    hidden.poster.version = 1;
    expect(hidden.frame().blank).toBe(true);
    expect(hidden.clips).toHaveLength(0);
    const still = stage({ autoplay: false, hideOnStop: false });
    expect(still.frame().blank).toBe(true); // not decoded yet
    still.poster.version = 1;
    expect(still.frame()).toMatchObject({
      blank: false,
      changed: true,
      textures: { media: still.poster },
    });
    expect(still.frame().changed).toBe(false);
    expect(still.clips).toHaveLength(0);
  });

  it("follows play, pause and stop as the transport says", () => {
    const { frame, cue, clip, clips } = stage({ autoplay: false });
    frame();
    cue("play"); // stopped → playing, a playback opened on its first frame
    clip().handle.version = 1;
    expect(frame()).toMatchObject({
      blank: false,
      textures: { media: clip().handle },
    });
    expect(clip().calls).toEqual(["play", "loop true"]);
    clip().calls.length = 0;
    cue("pause"); // playing → paused, the frame held
    frame();
    expect(clip().calls).toEqual(["pause"]);
    expect(frame().blank).toBe(false);
    clip().calls.length = 0;
    cue("pause"); // paused stays paused
    cue("play"); // paused → playing, resuming
    frame();
    expect(clip().calls).toEqual(["play"]);
    clip().calls.length = 0;
    cue("play"); // playing → restarts
    frame();
    expect(clip().calls).toEqual(["rewind", "play"]);
    clip().calls.length = 0;
    cue("stop"); // → stopped, hidden, the playback given up
    expect(frame().blank).toBe(true);
    expect(clip().calls).toEqual(["pause", "dispose"]);
    cue("pause"); // stopped stays stopped
    frame();
    expect(clips).toHaveLength(1);
    cue("play"); // and Play opens another
    frame();
    expect(clips).toHaveLength(2);
    expect(clip().calls).toEqual(["play", "loop true"]);
  });

  it("lands in stopped when a playback without Loop ends, and gives it up", () => {
    const { frame, clip } = stage({ loop: false });
    frame();
    clip().handle.version = 1;
    expect(frame().blank).toBe(false);
    clip().calls.length = 0;
    clip().end();
    expect(frame()).toMatchObject({ blank: true, changed: true });
    expect(clip().calls).toEqual(["pause", "dispose"]);
    const shown = stage({ loop: false, hideOnStop: false });
    shown.poster.version = 1;
    shown.frame();
    shown.clip().handle.version = 1;
    shown.clip().end();
    expect(shown.frame()).toMatchObject({
      blank: false,
      textures: { media: shown.poster },
    });
  });

  it("holds its playback while stopped with Keep Warm, and follows the Parameter live", () => {
    const { frame, cue, clip, clips } = stage({
      autoplay: false,
      keepWarm: true,
      hideOnStop: false,
    });
    frame();
    expect(clips).toHaveLength(1);
    expect(clip().calls).toEqual(["loop true"]);
    clip().handle.version = 1;
    expect(frame()).toMatchObject({
      blank: false,
      textures: { media: clip().handle },
    });
    clip().calls.length = 0;
    cue("play"); // the playback it holds, from the start
    frame();
    expect(clip().calls).toEqual(["rewind", "play"]);
    clip().calls.length = 0;
    cue("stop");
    frame();
    expect(clip().calls).toEqual(["pause", "rewind"]);
    expect(clips).toHaveLength(1);
    frame({ keepWarm: false }); // turned off while stopped: given up
    expect(clip().calls).toContain("dispose");
    frame({ keepWarm: true }); // and on again: another is opened
    expect(clips).toHaveLength(2);
  });

  it("applies Speed and Loop live", () => {
    const { frame, clip } = stage();
    frame();
    clip().calls.length = 0;
    frame({ speed: 2, loop: false });
    expect(clip().calls).toEqual(["rate 2", "loop false"]);
  });

  it("pauses the element while the Layer is hidden and resumes it when shown", () => {
    const { frame, hide, cue, clip } = stage();
    frame();
    clip().calls.length = 0;
    hide();
    expect(clip().calls).toEqual(["pause"]);
    clip().calls.length = 0;
    frame();
    expect(clip().calls).toEqual(["play"]);
    cue("pause");
    clip().calls.length = 0;
    hide(); // paused already: nothing to pause
    frame();
    expect(clip().calls).toEqual([]);
  });

  it("swaps the playback when the Media Parameter changes and disposes with the Layer", () => {
    const first = fakeVideo("one");
    const second = fakeVideo("two");
    const player = shader(
      video,
      context({}, { one: () => first, two: () => second }),
    );
    player.frame({ media: "one" });
    player.frame({ media: "two", autoplay: false, keepWarm: true });
    expect(first.calls).toContain("dispose");
    expect(second.calls).toEqual(["loop true"]);
    expect(player.frame({ media: "" })).toMatchObject({ blank: true });
    expect(second.calls).toContain("dispose");
    player.frame({ media: "one" });
    player.dispose();
    expect(first.calls.filter((call) => call === "dispose")).toHaveLength(2);
  });

  it("opens a fresh playback when the item it shows is repointed", () => {
    const handles: Record<string, MediaHandle> = { clip: fakeHandle("clip") };
    const clips = [fakeVideo("clip"), fakeVideo("clip")];
    let opened = 0;
    const player = shader(
      video,
      context(handles, { clip: () => clips[opened++] as MediaVideo }),
    );
    player.frame({ media: "clip" });
    player.frame({ media: "clip" });
    expect(opened).toBe(1);
    handles.clip = fakeHandle("clip");
    player.frame({ media: "clip" });
    expect(opened).toBe(2);
    expect(clips[0]?.calls).toContain("dispose");
    expect(clips[1]?.calls).toEqual(["play", "loop true"]);
  });
});
