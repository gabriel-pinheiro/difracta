import {
  defineShaderVisual,
  type MediaHandle,
  type MediaVideo,
} from "@difracta/render/sdk";

import { MEDIA_FIT_FRAGMENT, MEDIA_FIT_PARAMETERS } from "./media-fit.ts";
import {
  clampRate,
  createChase,
  owedAt,
  syncClip,
  type SyncedClip,
} from "./video-sync.ts";

/**
 * Transport: `play` from stopped starts at the first frame, from paused
 * resumes, from playing restarts; `pause` holds the frame; `stop` returns
 * to the first frame; a playback ending without Loop lands in stopped. The
 * element's clock is the browser's, the one exception to "integrate, never
 * sample": the Visual only steers it, and reports a change when a frame
 * was presented. A playback, and the decoder behind it, is held only
 * while playing or paused: stopped, the Layer shows the item's shared first
 * frame or nothing, unless Keep Warm holds the playback for the next Play.
 * A hidden Layer pauses the element and showing resumes it, so a faded-out
 * video does not decode for nothing. When the item it shows is pointed at
 * another file or Bundled Media entry, the Output reloads the item under a
 * new handle and the Visual opens a fresh playback of it, playing on if it
 * was. With Sync to Tempo on and a Media item that has beats, the rate is
 * the tempo's and a beat Cue bends it toward the beat (`video-sync.ts`).
 */
type Transport = "stopped" | "paused" | "playing";

export const video = defineShaderVisual({
  id: "video",
  name: "Video",
  description:
    "A video from the Installation's Media over the Target, with Play, Pause and Stop Cues, looping, speed, a tint and a tempo to follow.",
  recommended: true,
  notes:
    "Plays one video Media item on the Target, muted, with the same Fit choices as Image: Cover, the default, keeps its shape and crops, Contain keeps its shape and leaves the rest clear, Stretch maps it corner to corner. Autoplay starts it the moment the Layer is planned (a Scene played, the Layer enabled); off, it waits stopped on its first frame for the Play Cue. Play from stopped starts at the beginning, from paused resumes, and while playing restarts, so a Macro that fires Play on the downbeat re-syncs it; Pause holds the frame; Stop returns to the first frame, and with Hide on Stop the Layer goes dark until the next Play, so a clip can be a one-shot hit. Loop off ends in stopped the same way. Speed is the playback rate, 1/16 to 16 times, live. Sync to Tempo makes a clip with a pulse follow a song: it needs a Media item with Beats, which bundled loops and risers have and a file gets in its inspector or with `media beats`, and then plays the clip at Tempo, in BPM, whatever its own tempo is. Link Tempo to a Number Controller with anchors 0 and 300 and send it the metronome's BPM over 300. Tempo alone matches the speed and leaves the pulse wherever it falls; the Beat Cue puts it on the beat: fire it from a Macro on every beat of the metronome and the clip speeds up or slows down by a tenth at most until its nearest beat is on yours, within a few beats and without a jump, then holds the tempo. While synced, Speed is read as the nearest of ×¼, ×½, ×1, ×2 and ×4, for half-time and double-time, since the pulse stays on the beat at no other speed. A clip far from its own tempo stutters, 30 frames a second stretched to a song at half its tempo, so prefer the Speed that keeps the rate near 1. A Media item without Beats ignores Sync to Tempo and plays at Speed. Play restarts from the first frame as always and the Beat Cues pull it in again; every Layer chases on its own, so a Layer enabled by a held pad starts at the tempo but needs a few beats to find the phase. A white-on-black clip in Additive blend mode needs no keying: black adds nothing and the Tint paints the rest; link Tint to a Color Controller for the palette. Each Output plays its own copy of the file, so two Outputs may drift by a frame or two, and every Layer playing the clip decodes it separately. Costs a decode and one texture upload per video frame while playing, nothing while paused, stopped or faded out (a Layer at opacity zero pauses it). A stopped Layer holds no video player: Play takes the one the Output keeps ready for each Media item, so it starts at once, and a Layer that fires Play while another just took that clip's player opens its own, a frame or two later. Keep Warm makes the Layer hold its own player while stopped, for a Play that is always immediate, at the price of one more video player held, so leave it off except on the few hits that re-trigger fast on a clip other Layers play too. Hardware decoding goes to a limited number of players playing at the same moment (16 on Chromium on Linux) and the ones past it decode on the CPU, which the Output card shows as a warning, so keep the Layers playing at once under that. Stack Filters over it for treatment and Blink or Strobe in Additive above it for hits.",
  parameters: {
    media: {
      kind: "media",
      accepts: "video",
      default: "",
      label: "Video",
      description: "The Media item to play; none leaves the Layer blank.",
    },
    ...MEDIA_FIT_PARAMETERS,
    autoplay: {
      kind: "boolean",
      label: "Autoplay",
      default: true,
      description: "Start playing as soon as the Layer is planned.",
    },
    loop: {
      kind: "boolean",
      label: "Loop",
      default: true,
      description: "Start over at the end instead of stopping.",
    },
    speed: {
      kind: "number",
      label: "Speed",
      default: 1,
      min: 0.0625,
      max: 16,
      step: 0.0625,
      unit: "×",
      description: "The playback rate; 1 is the clip's own.",
    },
    sync: {
      kind: "boolean",
      label: "Sync to Tempo",
      default: false,
      description:
        "Play at Tempo instead of the clip's own and chase the Beat Cue; needs a Media item with Beats. Speed then multiplies in powers of two.",
    },
    tempo: {
      kind: "number",
      label: "Tempo",
      default: 120,
      min: 0,
      max: 300,
      step: 0.01,
      unit: "BPM",
      description:
        "The song's tempo, which the clip follows while Sync to Tempo is on. From 0 so a Link with anchors 0 and 300 takes the tempo over 300; near 0 the clip crawls at the slowest rate a video plays.",
    },
    keepWarm: {
      kind: "boolean",
      label: "Keep Warm",
      default: false,
      description:
        "Hold a video player while stopped, so Play is always immediate; costs one more video decoder held. Off, a stopped Layer holds none and Play takes the one kept ready for the Media item.",
    },
    hideOnStop: {
      kind: "boolean",
      label: "Hide on Stop",
      default: true,
      description:
        "Show nothing while stopped; off, the first frame stays on the Surface.",
    },
  },
  cues: [
    { key: "play", label: "Play" },
    { key: "pause", label: "Pause" },
    { key: "stop", label: "Stop" },
    {
      key: "beat",
      label: "Beat",
      description:
        "A beat of the song is now: with Sync to Tempo on, the clip bends its rate until its nearest beat falls on it.",
    },
  ],
  fragment: MEDIA_FIT_FRAGMENT,
  create({ media }) {
    let id: string | undefined;
    let playback: MediaVideo | undefined;
    // The item's shared handle, its first frame: a new one means the item was repointed.
    let loaded: MediaHandle | undefined;
    let transport: Transport = "stopped";
    let hidden = false;
    let keepWarm = false;
    let seen = -1;
    let lastHandle: MediaHandle | undefined;
    let lastTransport: Transport | undefined;
    // How the clip follows the tempo, as of the last update; undefined while it does not.
    let synced: SyncedClip | undefined;
    const chase = createChase();
    const close = (): void => {
      playback?.dispose();
      playback = undefined;
    };
    const beat = (): void => {
      if (playback === undefined || synced === undefined) return;
      if (transport !== "playing" || hidden) return;
      chase.measure(owedAt(playback.position, synced));
    };
    const play = (): void => {
      // A playback just opened is on its first frame already.
      const opened = playback === undefined;
      if (opened && id !== undefined && id !== "") playback = media.video(id);
      if (playback === undefined) return;
      if (!opened && transport !== "paused") {
        playback.rewind();
        chase.reset();
      }
      transport = "playing";
      if (!hidden) playback.play();
    };
    const pause = (): void => {
      if (playback === undefined || transport !== "playing") return;
      playback.pause();
      transport = "paused";
    };
    const stop = (): void => {
      if (playback !== undefined) {
        playback.pause();
        if (keepWarm) playback.rewind();
        else close();
      }
      transport = "stopped";
    };
    const retarget = (next: string, autoplay: boolean): void => {
      close();
      id = next;
      loaded = next === "" ? undefined : media.get(next);
      transport = "stopped";
      seen = -1;
      if (autoplay) play();
    };
    return {
      cue(key) {
        if (key === "play") play();
        else if (key === "pause") pause();
        else if (key === "stop") stop();
        else if (key === "beat") beat();
      },
      hidden() {
        hidden = true;
        if (transport === "playing") playback?.pause();
      },
      shown() {
        hidden = false;
        if (transport === "playing") playback?.play();
      },
      update({ params, changed, dt }) {
        keepWarm = params.keepWarm;
        if (params.media !== id) retarget(params.media, params.autoplay);
        else if (id !== "" && media.get(id) !== loaded)
          retarget(id, params.autoplay || transport === "playing");
        if (transport === "stopped") {
          if (keepWarm && id !== undefined && id !== "")
            playback ??= media.video(id);
          else close();
        }
        const beats =
          params.sync && playback !== undefined && id !== undefined
            ? media.beats(id)
            : undefined;
        synced =
          beats === undefined || playback === undefined
            ? undefined
            : syncClip(beats, playback.duration, params.tempo, params.speed);
        if (synced === undefined || transport !== "playing") chase.reset();
        if (playback !== undefined) {
          playback.setRate(
            synced === undefined
              ? params.speed
              : clampRate(synced.rate * (1 + chase.advance(dt, synced.rate))),
          );
          playback.setLoop(params.loop);
          if (transport === "playing" && playback.ended) stop();
        }
        const handle = playback?.handle ?? loaded;
        if (handle === undefined) return { changed, blank: true, textures: {} };
        const fresh =
          handle !== lastHandle ||
          handle.version !== seen ||
          transport !== lastTransport;
        seen = handle.version;
        lastHandle = handle;
        lastTransport = transport;
        return {
          changed: changed || fresh,
          blank:
            handle.image === null ||
            (transport === "stopped" && params.hideOnStop),
          textures: { media: handle },
        };
      },
      dispose() {
        close();
      },
    };
  },
});
