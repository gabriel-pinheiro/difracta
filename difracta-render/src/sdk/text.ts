import type { MediaHandle } from "./media.ts";
import type { TextMeasure } from "./text-layout.ts";

/**
 * How a shader Visual draws text. The engine rasterizes with the
 * browser, in a Bundled Font, once per distinct request, and shares the
 * picture between the instances asking for the same one; an instance
 * hands the handle back from `update` under `textures` like a Media
 * handle, and the fragment places and colors it. The picture holds
 * coverage, not color: the fill in red and the outline in green, on
 * black, so colors are uniforms and changing one draws no text again
 * (`TEXT_GLSL`). Everything answers undefined until the font has loaded,
 * and `version` advances when a font arrives, which is when to ask again.
 * A font that failed to load, or an id the Catalog lacks, throws.
 */
export interface TextStyle {
  /** A Bundled Font's id. */
  readonly font: string;
  /** Space added after every letter, in ems. */
  readonly letterSpacing: number;
}

export interface TextRaster extends TextStyle {
  /** The size of one em in the picture's pixels. */
  readonly size: number;
  /** How far the outline reaches past the glyph, in ems; zero draws none. */
  readonly outline: number;
}

export const TEXT_ALIGNS = ["left", "center", "right"] as const;
export type TextAlign = (typeof TEXT_ALIGNS)[number];

export interface TextBlockRequest extends TextRaster {
  /** The lines as they are drawn; breaking them is the Visual's (`layoutText`). */
  readonly lines: readonly string[];
  /** The distance between two baselines, in ems. */
  readonly lineHeight: number;
  readonly align: TextAlign;
}

export interface TextRowsRequest extends TextRaster {
  /** One text per cell, each centered in its cell. */
  readonly rows: readonly string[];
}

/** What every text picture says of itself, in its own pixels. */
export interface TextHandle extends MediaHandle {
  /** The size of one em the picture was drawn at, which a request too large for a texture lowers. */
  readonly size: number;
  /** The margin around the content on every side, which the outline and overhanging glyphs reach into. */
  readonly inset: number;
}

/** Lines of text as one block: the content is the picture less its inset. */
export type TextBlock = TextHandle;

/**
 * Texts in cells of one size, laid left to right and then top to bottom
 * in as many columns as keep the picture nearest to square, so that many
 * texts can each be drawn large before the picture is as long as a
 * texture may be.
 */
export interface TextRows extends TextHandle {
  /** How many cells lie side by side. */
  readonly columns: number;
  /** The size of one cell, its inset on every side included. */
  readonly cellWidth: number;
  readonly rowHeight: number;
  /** The width of each text, which is centered in its cell. */
  readonly widths: readonly number[];
}

export interface TextContext {
  /** Advances when a Bundled Font arrives. */
  readonly version: number;
  /** How wide text is in this style, in ems; undefined until the font has loaded. */
  measure(style: TextStyle): TextMeasure | undefined;
  block(request: TextBlockRequest): TextBlock | undefined;
  rows(request: TextRowsRequest): TextRows | undefined;
}

/** A context with no fonts: what a player runs with outside an Output. */
export const NO_TEXT: TextContext = {
  version: 0,
  measure: () => undefined,
  block: () => undefined,
  rows: () => undefined,
};

/**
 * The GLSL a text fragment colors a sample with: `cover` is the picture's
 * red and green, the fill's and the outline's coverage. The fill lies
 * over the outline; the result is straight alpha.
 */
export const TEXT_GLSL = `
vec4 text_color(vec2 cover, vec4 fill, vec4 outline) {
  float inside = cover.r * fill.a;
  float around = cover.g * outline.a * (1.0 - inside);
  float alpha = inside + around;
  if (alpha <= 0.0) return vec4(0.0);
  return vec4((fill.rgb * inside + outline.rgb * around) / alpha, alpha);
}
`;
