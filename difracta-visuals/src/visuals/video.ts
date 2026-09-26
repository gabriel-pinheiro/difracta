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
 * was presented. A hidden Layer pauses the element and showing resumes it,
 * so a faded-out video does not decode for nothing. When the item it shows
 * is pointed at another file or Bundled Media entry, the Output reloads the
 * item under a new handle and the Visual opens a fresh playback of it,
 * playing on if it was.
 */
type Transport = "stopped" | "paused" | "playing";

export const video = defineShaderVisual({
  id: "video",
  name: "Video",
  description:
    "A video from the Installation's Media over the Target, with Play, Pause and Stop Cues, looping, speed and a tint.",
  recommended: true,
  notes:
    "Plays one video Media item on the Target, muted, with the same Fit choices as Image: Stretch maps it corner to corner, Cover keeps its shape and crops, Contain keeps its shape and leaves the rest clear. Autoplay starts it the moment the Layer is planned (a Scene played, the Layer enabled); off, it waits stopped on its first frame for the Play Cue. Play from stopped starts at the beginning, from paused resumes, and while playing restarts, so a Macro that fires Play on the downbeat re-syncs it; Pause holds the frame; Stop returns to the first frame, and with Hide on Stop the Layer goes dark until the next Play, so a clip can be a one-shot hit. Loop off ends in stopped the same way. Speed is the playback rate, 1/16 to 16 times, live. A white-on-black clip in Additive blend mode needs no keying: black adds nothing and the Tint paints the rest; link Tint to a Color Controller for the palette. Each Output plays its own copy of the file, so two Outputs may drift by a frame or two, and every Layer showing the clip decodes it separately. Costs a decode and one texture upload per video frame while playing, nothing while paused, stopped or faded out (a Layer at opacity zero pauses it). Stack Filters over it for treatment and Blink or Strobe in Additive above it for hits.",
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
    // The item's shared handle when the playback opened: a new one means the item was repointed.
    let loaded: MediaHandle | undefined;
    let transport: Transport = "stopped";
    let hidden = false;
    let seen = -1;
    let lastTransport: Transport | undefined;
    const play = (): void => {
      if (playback === undefined) return;
      if (transport !== "paused") playback.rewind();
      transport = "playing";
      if (!hidden) playback.play();
    };
    const pause = (): void => {
      if (playback === undefined || transport !== "playing") return;
      playback.pause();
      transport = "paused";
    };
    const stop = (): void => {
      if (playback === undefined) return;
      playback.pause();
      playback.rewind();
      transport = "stopped";
    };
    const open = (next: string, autoplay: boolean): void => {
      playback?.dispose();
      id = next;
      loaded = next === "" ? undefined : media.get(next);
      playback = next === "" ? undefined : media.video(next);
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
        if (params.media !== id) open(params.media, params.autoplay);
        else if (id !== "" && media.get(id) !== loaded)
          open(id, params.autoplay || transport === "playing");
        const current = playback;
        if (current === undefined)
          return { changed, blank: true, textures: {} };
        current.setRate(params.speed);
        current.setLoop(params.loop);
        if (transport === "playing" && current.ended) stop();
        const { handle } = current;
        const fresh = handle.version !== seen || transport !== lastTransport;
        seen = handle.version;
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
        playback?.dispose();
        playback = undefined;
      },
    };
  },
});
