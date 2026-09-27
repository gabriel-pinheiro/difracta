import { TEXT_GLSL } from "@difracta/render/sdk";

/**
 * The Counter's pictures and the fragment that reads them. The digits and
 * the sign are cells of one picture, the Prefix and the Suffix the two
 * cells of another, since a long one would widen every digit's cell and
 * so lower the size digits can be drawn at. The number is pieces left to
 * right, each showing one cell, a digit on its way to the next showing
 * the two it lies between.
 */

/** The most digits shown; a count of more shows its lowest. */
export const MAX_DIGITS = 6;
/** Digits, the sign, the Prefix and the Suffix. */
export const MAX_PIECES = MAX_DIGITS + 3;
/** What a piece shows: below 10 a digit, then the sign, the Prefix and the Suffix. */
export const SIGN_CELL = 10;
export const PREFIX_CELL = 11;
export const SUFFIX_CELL = 12;

export const COUNTER_FRAGMENT = `
uniform sampler2D u_glyphs;
uniform sampler2D u_affixes;
// Where the number lies on the Surface: its corner and its size, in uv.
uniform vec4 u_number_rect;
// Each picture's columns and lines of cells, and the width of one cell
// and of the margin around its text, in widths of the number.
uniform vec2 u_glyphs_grid;
uniform float u_glyphs_cell;
uniform vec2 u_affixes_grid;
uniform float u_affixes_cell;
uniform float u_cell_inset;
// The pieces left to right: each one's center and width, in widths of the
// number, and what it shows, which for a digit on its way to the next
// lies between two.
uniform float u_piece_count;
uniform float u_piece_center[${String(MAX_PIECES)}];
uniform float u_piece_width[${String(MAX_PIECES)}];
uniform float u_piece_cell[${String(MAX_PIECES)}];
${TEXT_GLSL}
const float PI = 3.14159265;

// Where cell index of a picture is sampled for a place in the piece: x from its center in cells, y down it.
vec2 cell_uv(float index, float x, float y, vec2 grid) {
  return vec2(
    (mod(index, grid.x) + 0.5 + x) / grid.x,
    (floor(index / grid.x) + y) / grid.y
  );
}

vec4 render_visual(vec2 uv) {
  vec2 p = (uv - u_number_rect.xy) / u_number_rect.zw;
  if (p.y < 0.0 || p.y > 1.0) return vec4(0.0);
  vec2 cover = vec2(0.0);
  for (int i = 0; i < ${String(MAX_PIECES)}; i += 1) {
    if (float(i) >= u_piece_count) break;
    float x = p.x - u_piece_center[i];
    if (abs(x) > u_piece_width[i] * 0.5 + u_cell_inset) continue;
    float place = u_piece_cell[i];
    float y = p.y;
    if (place > 10.5) {
      float across = x / u_affixes_cell;
      if (abs(across) > 0.5) continue;
      cover = max(cover, texture(u_affixes, cell_uv(place - 11.0, across, y, u_affixes_grid)).rg);
      continue;
    }
    float cell = place;
    if (place < 10.0) {
      if (u_animation == 1) {
        // Roll: the window slides down the digits, which repeat after 9.
        cell = mod(floor(place + y), 10.0);
        y = fract(place + y);
      } else {
        cell = mod(floor(place + 0.5), 10.0);
        if (u_animation == 2) {
          // Flip: folded flat halfway between two digits.
          float open = abs(cos(PI * fract(place)));
          y = (y - 0.5) / max(open, 0.001) + 0.5;
          if (y < 0.0 || y > 1.0) continue;
        }
      }
    }
    float across = x / u_glyphs_cell;
    if (abs(across) > 0.5) continue;
    cover = max(cover, texture(u_glyphs, cell_uv(cell, across, y, u_glyphs_grid)).rg);
  }
  return text_color(cover, u_fill, u_outline);
}`;
