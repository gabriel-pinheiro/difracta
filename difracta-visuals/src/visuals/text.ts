import {
  TEXT_GLSL,
  defineShaderVisual,
  layoutText,
  rasterSize,
  type TextBlock,
} from "@difracta/render/sdk";

import {
  TEXT_COLOR_PARAMETERS,
  TEXT_FIT_PARAMETERS,
  TEXT_MARGIN_PARAMETER,
  shownOutline,
  textBox,
} from "./text-style.ts";

const ALIGN = { left: 0, center: 0.5, right: 1 } as const;
const VERTICAL = { top: 0, middle: 0.5, bottom: 1 } as const;

export const text = defineShaderVisual({
  id: "text",
  name: "Text",
  description:
    "Words on the Target in a Bundled Font, fitted to it or at a size of your choosing, filled and outlined.",
  recommended: true,
  notes:
    "A title, a name, a line of a lyric. It draws on transparency, so it goes over any Visual; on a busy one give it an Outline Width of 4 to 8% in a dark Outline Color, which is what keeps letters readable over motion. Fit decides what Size means. With Fit, the text wraps and takes the largest size at which all of it fits inside the Margin, so a word fills the Target and a sentence arranges itself in lines; Size then shrinks it from there. With Fill Width the lines stay as typed and the widest spans the Target. With Fixed, Size is the height of the type as a share of the Target's height and the text wraps at the Margin; what does not fit below is cut. Align places the lines against each other and the block in the Target, Vertical Align places the block top to bottom. Uppercase suits Bebas Neue, which has capitals only, and DSEG7 Classic spells only what seven segments can. The text is drawn once and kept: Fill Color, Outline Color and Vertical Align move freely, and so does Size under Fit and Fill Width, which draws again only a few times along a sweep. What draws the text again is a change of the text, Font, Letter Spacing, Line Height or Outline Width, of Align on several lines, and of whatever moves the line breaks: Size under Fixed, and Margin. Sweeping those on a long text is the expensive corner. Link Text to a Text Controller to change the words of several Layers at once or from OSC, and set it from a Macro to put a name on the wall with one button. Stack Filters above it for motion: Wave Distortion, Chromatic Aberration, Block Glitch on a hit.",
  parameters: {
    text: {
      kind: "text",
      label: "Text",
      default: "Text",
      multiline: true,
      description: "What to show; a line break starts a new line.",
    },
    ...TEXT_FIT_PARAMETERS,
    align: {
      kind: "choice",
      label: "Align",
      default: "center",
      options: [
        { value: "left", label: "Left" },
        { value: "center", label: "Center" },
        { value: "right", label: "Right" },
      ],
    },
    vertical: {
      kind: "choice",
      label: "Vertical Align",
      default: "middle",
      options: [
        { value: "top", label: "Top" },
        { value: "middle", label: "Middle" },
        { value: "bottom", label: "Bottom" },
      ],
    },
    ...TEXT_COLOR_PARAMETERS,
    lineHeight: {
      kind: "number",
      label: "Line Height",
      default: 1.15,
      min: 0.8,
      max: 2,
      step: 0.05,
      unit: "×",
      description: "The distance from one line to the next, in type sizes.",
    },
    letterSpacing: {
      kind: "number",
      label: "Letter Spacing",
      default: 0,
      min: -0.05,
      max: 0.5,
      step: 0.01,
      unit: "em",
    },
    uppercase: { kind: "boolean", label: "Uppercase", default: false },
    margin: TEXT_MARGIN_PARAMETER,
  },
  fragment: `
uniform sampler2D u_block;
// Where the picture lies on the Surface: its corner and its size, in uv.
uniform vec4 u_block_rect;
${TEXT_GLSL}
vec4 render_visual(vec2 uv) {
  vec2 p = (uv - u_block_rect.xy) / u_block_rect.zw;
  if (any(lessThan(p, vec2(0.0))) || any(greaterThan(p, vec2(1.0)))) return vec4(0.0);
  return text_color(texture(u_block, p).rg, u_fill, u_outline);
}`,
  create({ text }) {
    let block: TextBlock | undefined;
    let rect: readonly [number, number, number, number] = [0, 0, 0, 0];
    let fonts = -1;
    let width = 0;
    let height = 0;
    return {
      update({ params, changed, width: nextWidth, height: nextHeight }) {
        const stale =
          changed ||
          fonts !== text.version ||
          width !== nextWidth ||
          height !== nextHeight;
        if (!stale) return { changed: false, blank: block === undefined };
        fonts = text.version;
        width = nextWidth;
        height = nextHeight;
        block = undefined;
        const style = {
          font: params.font,
          letterSpacing: params.letterSpacing,
        };
        const measure = text.measure(style);
        const box = textBox(width, height, params.margin);
        const layout =
          measure === undefined
            ? undefined
            : layoutText({
                text: params.uppercase
                  ? params.text.toLocaleUpperCase()
                  : params.text,
                width: box.width,
                height: box.height,
                fit: params.fit,
                fixedSize: params.size * height,
                lineHeight: params.lineHeight,
                measure,
              });
        const visible = params.fill[3] > 0 || shownOutline(params) > 0;
        if (layout === undefined || !visible)
          return { changed: true, blank: true };
        const size =
          params.fit === "fixed" ? layout.size : layout.size * params.size;
        block = text.block({
          ...style,
          size: rasterSize(size),
          outline: shownOutline(params),
          lines: layout.lines,
          lineHeight: params.lineHeight,
          // One line has nothing to align against, so every Align shares its picture.
          align: layout.lines.length > 1 ? params.align : "left",
        });
        if (block === undefined) return { changed: true, blank: true };
        // Pixels on the Target per pixel of the picture.
        const scale = size / block.size;
        const inset = block.inset * scale;
        const contentWidth = block.width * scale - inset * 2;
        const contentHeight = block.height * scale - inset * 2;
        const x = box.x + (box.width - contentWidth) * ALIGN[params.align];
        const y =
          box.y + (box.height - contentHeight) * VERTICAL[params.vertical];
        rect = [
          (x - inset) / width,
          (y - inset) / height,
          (block.width * scale) / width,
          (block.height * scale) / height,
        ];
        return {
          changed: true,
          blank: false,
          uniforms: { block_rect: rect },
          textures: { block },
        };
      },
    };
  },
});
