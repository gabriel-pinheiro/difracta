import { defineShaderVisual, type MediaHandle } from "@difracta/render/sdk";

import { MEDIA_FIT_FRAGMENT, MEDIA_FIT_PARAMETERS } from "./media-fit.ts";

export const image = defineShaderVisual({
  id: "image",
  name: "Image",
  description:
    "A picture from a Pack over the Target, covering, contained or stretched, through a tint.",
  recommended: true,
  notes:
    "Shows one image entry of a Pack on the Target, named by its Media reference `<pack>/<entry>`, which the Library picks for the Image Parameter: Cover, the default, keeps its shape and crops the overflow, Contain keeps its shape and leaves the rest of the Surface clear, and Stretch maps it corner to corner, so a picture drawn at the Surface's proportions lands exactly whatever else it does. A white-on-black picture on a Layer in Additive blend mode needs no keying: black adds nothing, so only the drawing lights the wall, and Tint paints it; link Tint to a Color Controller to put the artwork in the show's palette. A PNG with transparency composes the same way in Normal. Costs one texture upload when the picture arrives and one shader pass per Surface only on the frames something changed; a static picture costs the Output nothing between edits. Stack it under Filters for motion (Wave Distortion, Chromatic Aberration) or under Blink, Strobe or Flash Matrix in Additive for hits on top of it; swap the Image Parameter from a Macro to change artwork on a Cue, setting it to another entry's reference. An entry whose Pack is missing on this runtime, or whose file is gone, leaves the Layer blank until it is back.",
  parameters: {
    media: {
      kind: "media",
      accepts: "image",
      default: "",
      label: "Image",
      description:
        "The Pack entry to show, as `<pack>/<entry>`; none leaves the Layer blank.",
    },
    ...MEDIA_FIT_PARAMETERS,
  },
  fragment: MEDIA_FIT_FRAGMENT,
  create({ media }) {
    let handle: MediaHandle | undefined;
    let seen = -1;
    return {
      update({ params, changed }) {
        const current =
          params.media === "" ? undefined : media.get(params.media);
        const version = current?.version ?? 0;
        // A picture that arrived, or another entry, is a new texture.
        const fresh = current !== handle || version !== seen;
        handle = current;
        seen = version;
        return {
          changed: changed || fresh,
          blank: current?.image == null,
          textures: current === undefined ? {} : { media: current },
        };
      },
    };
  },
});
