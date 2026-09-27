import {
  defineShaderVisual,
  type MediaHandle,
  type MediaVideo,
} from "@difracta/render/sdk";

import { MEDIA_FIT_FRAGMENT, MEDIA_FIT_PARAMETERS } from "./media-fit.ts";

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
 * was.
 */
type Transport = "stopped" | "paused" | "playing";

export const video = defineShaderVisual({
  id: "video",
  name: "Video",
  description:
    "A video from the Installation's Media over the Target, with Play, Pause and Stop Cues, looping, speed and a tint.",
  recommended: true,
  notes:
    "Plays one video Media item on the Target, muted, with the same Fit choices as Image: Stretch maps it corner to corner, Cover keeps its shape and crops, Contain keeps its shape and leaves the rest clear. Autoplay starts it the moment the Layer is planned (a Scene played, the Layer enabled); off, it waits stopped on its first frame for the Play Cue. Play from stopped starts at the beginning, from paused resumes, and while playing restarts, so a Macro that fires Play on the downbeat re-syncs it; Pause holds the frame; Stop returns to the first frame, and with Hide on Stop the Layer goes dark until the next Play, so a clip can be a one-shot hit. Loop off ends in stopped the same way. Speed is the playback rate, 1/16 to 16 times, live. A white-on-black clip in Additive blend mode needs no keying: black adds nothing and the Tint paints the rest; link Tint to a Color Controller for the palette. Each Output plays its own copy of the file, so two Outputs may drift by a frame or two, and every Layer playing the clip decodes it separately. Costs a decode and one texture upload per video frame while playing, nothing while paused, stopped or faded out (a Layer at opacity zero pauses it). A stopped Layer holds no video player: Play takes the one the Output keeps ready for each Media item, so it starts at once, and a Layer that fires Play while another just took that clip's player opens its own, a frame or two later. Keep Warm makes the Layer hold its own player while stopped, for a Play that is always immediate, at the price of one more video player held, so leave it off except on the few hits that re-trigger fast on a clip other Layers play too. Hardware decoding goes to a limited number of players playing at the same moment (16 on Chromium on Linux) and the ones past it decode on the CPU, which the Output card shows as a warning, so keep the Layers playing at once under that. Stack Filters over it for treatment and Blink or Strobe in Additive above it for hits.",
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
    const close = (): void => {
      playback?.dispose();
      playback = undefined;
    };
    const play = (): void => {
      // A playback just opened is on its first frame already.
      const opened = playback === undefined;
      if (opened && id !== undefined && id !== "") playback = media.video(id);
      if (playback === undefined) return;
      if (!opened && transport !== "paused") playback.rewind();
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
      },
      hidden() {
        hidden = true;
        if (transport === "playing") playback?.pause();
      },
      shown() {
        hidden = false;
        if (transport === "playing") playback?.play();
      },
      update({ params, changed }) {
        keepWarm = params.keepWarm;
        if (params.media !== id) retarget(params.media, params.autoplay);
        else if (id !== "" && media.get(id) !== loaded)
          retarget(id, params.autoplay || transport === "playing");
        if (transport === "stopped") {
          if (keepWarm && id !== undefined && id !== "")
            playback ??= media.video(id);
          else close();
        }
        if (playback !== undefined) {
          playback.setRate(params.speed);
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
