import { settings } from "@difracta/core";
import { defineShaderVisual, type MediaHandle } from "@difracta/render/sdk";

import { cropRect } from "./live-crop.ts";
import { FIT_GLSL, FIT_PARAMETER } from "./media-fit.ts";

const crop = (side: string, label: string) =>
  ({
    kind: "number",
    label: `Crop ${label}`,
    default: 0,
    min: 0,
    max: 1,
    step: 0.0005,
    description: `The fraction of the picture cut from its ${side}.`,
  }) as const;

/**
 * Shows a Screen Share as this Output receives it (`media.live`): the
 * picture cropped, then fitted to the Target. The engine views the slot
 * and recovers a connection that dropped; the instance only reads the
 * handle, and counts how long a lost picture has been held. It is blank
 * while nobody shares, until the first frame arrives, and once a lost
 * picture was held for `settings.shares.viewer.holdSeconds`, or at once
 * with On Signal Loss at Blank. It changes with each frame that arrives,
 * which is the Sharer's to send or not while its screen is still.
 */
export const live = defineShaderVisual({
  id: "live",
  name: "Live",
  description:
    "A Screen Share over the Target: a screen or a window shared from Difracta Desktop, cropped to the part that matters, covering, contained or stretched.",
  recommended: true,
  notes:
    "Shows one Screen Share, a Media item that is a named slot a person shares a screen or a window into from Difracta Desktop on their own computer (its menu, Share Screen); nothing in the Installation, no Macro and no command starts a share, so the Layer is blank until somebody does, and blank again when they stop, showing whatever lies under it. `difracta share list` says who shares into each slot. The picture is opaque and arrives as the sharing computer encodes it, a frame or two behind the screen it comes from, with no sound. Crop Left, Top, Right and Bottom each cut a fraction of the picture from that side, so a browser window showing a video is cut down to the video: crop first, since Fit then works on what is left, and a 16:9 video cut out of a window covers a 16:9 Surface exactly. The crops are fractions, so the cut follows the window if it is resized in proportion, but the toolbars of a window keep their size in pixels: after resizing the shared window set them again. Crops that would meet leave a sliver; Left and Top win. Fit is the same as Image's: Cover, the default, keeps the shape and crops the overflow, Contain keeps the shape and leaves the rest of the Surface clear, Stretch maps the cut corner to corner. One share can feed several Layers, each with its own crops, to put two parts of one screen on two Surfaces; every Layer of an Output showing the same slot shares one picture and one decode. On Signal Loss says what happens when the connection to the sharing computer drops while the share goes on: Hold keeps the last frame for a few seconds, which hides a short break, then goes blank; Blank goes dark at once. The Output asks for the picture again by itself, and it returns without anyone doing anything. Costs the Output one video decode per slot it shows and one texture upload per frame that arrives, thirty a second while the screen moves and, from some sharing computers, while it is still too; the sharing computer encodes once per Output viewing the slot, eight at most, so put a share on the Outputs that need it. An Output starts receiving when a Layer of the active Scene names the slot, enabled or not, so a Macro that enables the Layer finds the picture there. Stack Filters over it for treatment (Chromatic Aberration, a glitch on a hit), put a frame Visual around it on a Path, or a Blink in Additive above it; it has no Tint, so color it with a Filter. For a clip that must play in time or loop, use Video with a file instead: a share is as live, and as fragile, as the computer it comes from.",
  parameters: {
    media: {
      kind: "media",
      accepts: "live",
      default: "",
      label: "Screen Share",
      description:
        "The Screen Share to show; none leaves the Layer blank, and so does a slot nobody shares into.",
    },
    fit: FIT_PARAMETER,
    cropLeft: crop("left", "Left"),
    cropTop: crop("top", "Top"),
    cropRight: crop("right", "Right"),
    cropBottom: crop("bottom", "Bottom"),
    signalLoss: {
      kind: "choice",
      label: "On Signal Loss",
      default: "hold",
      options: [
        { value: "hold", label: "Hold" },
        { value: "blank", label: "Blank" },
      ],
      description:
        "When the connection to the sharing computer drops: Hold keeps the last frame for a few seconds before going blank, Blank shows nothing at once.",
    },
  },
  fragment: `
uniform sampler2D u_media;
uniform vec2 u_media_size;
// The part of the picture the crops leave: where it starts and its size, in fractions.
uniform vec2 u_crop_origin;
uniform vec2 u_crop_size;
${FIT_GLSL}

vec4 render_visual(vec2 uv) {
  vec2 p = fit_uv(uv, u_media_size * u_crop_size);
  if (outside_picture(p)) return vec4(0.0);
  return vec4(texture(u_media, u_crop_origin + p * u_crop_size).rgb, 1.0);
}`,
  create({ media }) {
    let handle: MediaHandle | undefined;
    let seen = -1;
    let blank = true;
    /** How long the picture shown has been a lost one, in seconds. */
    let lostFor = 0;
    return {
      update({ params, changed, dt }) {
        const share =
          params.media === "" ? undefined : media.live(params.media);
        const current = share?.handle;
        lostFor = share?.lost === true ? lostFor + dt : 0;
        const given =
          share?.lost === true &&
          (params.signalLoss === "blank" ||
            lostFor >= settings.shares.viewer.holdSeconds);
        const nothing = current?.image == null || given;
        const version = current?.version ?? 0;
        // A frame that arrived, another slot, or the picture coming or going.
        const fresh =
          current !== handle || version !== seen || nothing !== blank;
        handle = current;
        seen = version;
        blank = nothing;
        const rect = cropRect({
          left: params.cropLeft,
          top: params.cropTop,
          right: params.cropRight,
          bottom: params.cropBottom,
        });
        return {
          changed: changed || fresh,
          blank: nothing,
          textures: current === undefined ? {} : { media: current },
          uniforms: {
            crop_origin: [rect.x, rect.y],
            crop_size: [rect.width, rect.height],
          },
        };
      },
    };
  },
});
