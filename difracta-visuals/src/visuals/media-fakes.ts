import type { MediaBeats } from "@difracta/core";
import {
  createShaderPlayer,
  type MediaContext,
  type MediaHandle,
  type MediaVideo,
  type ShaderVisual,
} from "@difracta/render/sdk";

import { video } from "./video.ts";

/** What the tests of Image and Video stand on: Media that loads, plays and advances by hand. */
const DT = 1 / 60;

/** A handle the test loads and advances by hand. */
export interface FakeHandle extends Omit<MediaHandle, "version"> {
  version: number;
}

export function fakeHandle(id: string): FakeHandle {
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
export function fakeVideo(id: string) {
  const handle = fakeHandle(id);
  const calls: string[] = [];
  let ended = false;
  let rate = 1;
  let loop = false;
  const playback: Omit<MediaVideo, "handle" | "position" | "duration"> & {
    handle: FakeHandle;
    calls: string[];
    position: number;
    duration: number;
    readonly rate: number;
    end(): void;
  } = {
    handle,
    calls,
    position: 0,
    duration: 0,
    get rate() {
      return rate;
    },
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

export function context(
  handles: Record<string, MediaHandle> = {},
  videos: Record<string, () => MediaVideo> = {},
  beats: Record<string, MediaBeats> = {},
): MediaContext {
  return {
    get: (id) => handles[id],
    video: (id) => videos[id]?.(),
    beats: (id) => beats[id],
  };
}

export function shader(visual: ShaderVisual, media: MediaContext) {
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

/** One Media item: its shared first frame, and the playbacks opened on it, in order. */
export function stage(
  values: Record<string, unknown> = {},
  beats: Record<string, MediaBeats> = {},
) {
  const poster = fakeHandle("clip");
  const clips: ReturnType<typeof fakeVideo>[] = [];
  const player = shader(
    video,
    context(
      { clip: poster },
      {
        clip: () => {
          const clip = fakeVideo("clip");
          clips.push(clip);
          return clip;
        },
      },
      beats,
    ),
  );
  const frame = (more: Record<string, unknown> = {}) =>
    player.frame({ media: "clip", ...values, ...more });
  const clip = (index = clips.length - 1) => {
    const found = clips[index];
    if (found === undefined) throw new Error("No playback was opened.");
    return found;
  };
  return { ...player, frame, clip, clips, poster };
}
