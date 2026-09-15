import { defineShaderVisual } from "@difracta/render/sdk";

/** Where both terms of a cell's phase come back round together. */
const PERIOD = Math.PI * 20;

export const repeatingShapes = defineShaderVisual({
  id: "repeating-shapes",
  name: "Repeating Shapes",
  description:
    "A bold grid of circles, bars and triangles over a flat ground, each tile rocking and breathing at its own phase.",
  notes:
    "Graphic, poster-like wallpaper: the one Visual here that paints its own opaque Background, so it covers whatever is below rather than sitting over it. Tile Size is the cell in Layer pixels and is the only thing that sets how many tiles there are, so a large Surface at 32 px is a fine mosaic and at 180 px a few flat blocks; because it is a shader the density costs nothing either way and the edges stay clean at any Surface size or projection angle. Shapes picks which of the three is drawn: All runs a diagonal cycle of circle, bar and triangle, and the single-shape settings keep that cycle for the colors, so Circles still alternates Primary and Secondary. Only circles read the breathing, so a Circles grid pulses while Bars and Triangles only rock. Speed drives the rocking and integrates, so 0 freezes a still pattern that then costs nothing and any change to it is smooth. Costs one full-Surface pass per frame while it moves. Stack Dither or Scanlines over it for a printed look.",
  parameters: {
    background: {
      kind: "color",
      label: "Background",
      default: [0.933, 0.878, 0.749, 1],
    },
    colorA: {
      kind: "color",
      label: "Primary Color",
      default: [0.882, 0.176, 0.141, 1],
    },
    colorB: {
      kind: "color",
      label: "Secondary Color",
      default: [0.11, 0.259, 0.541, 1],
    },
    shapes: {
      kind: "choice",
      label: "Shapes",
      default: "all",
      options: [
        { value: "all", label: "All" },
        { value: "circles", label: "Circles" },
        { value: "bars", label: "Bars" },
        { value: "triangles", label: "Triangles" },
      ],
    },
    tileSize: {
      kind: "number",
      label: "Tile Size",
      default: 72,
      min: 32,
      max: 180,
      step: 2,
      unit: "px",
    },
    speed: {
      kind: "number",
      label: "Speed",
      default: 0.45,
      min: 0,
      max: 3,
      step: 0.05,
      unit: "x",
    },
  },
  fragment: `
uniform float u_time;
uniform float u_seed;

float rs_box(vec2 point, vec2 half_size) {
  vec2 away = abs(point) - half_size;
  return length(max(away, 0.0)) + min(max(away.x, away.y), 0.0);
}

float rs_edge(vec2 point, vec2 from, vec2 to) {
  vec2 along = to - from;
  return dot(point - from, normalize(vec2(along.y, -along.x)));
}

// An upright isosceles triangle in the same proportions the tile had on canvas.
float rs_triangle(vec2 point, float size) {
  vec2 apex = vec2(0.0, -0.36 * size);
  vec2 right = vec2(0.34 * size, 0.30 * size);
  vec2 left = vec2(-0.34 * size, 0.30 * size);
  return max(
    max(rs_edge(point, apex, right), rs_edge(point, right, left)),
    rs_edge(point, left, apex)
  );
}

vec4 render_visual(vec2 uv) {
  vec2 pixel = uv * u_resolution;
  float size = max(u_tileSize, 1.0);
  vec2 grid = pixel / size;
  vec2 cell = floor(grid);
  // Every tile is drawn folded into one cell; no shape reaches past its own.
  vec2 offset = (fract(grid) - 0.5) * size;

  float slot = mod(cell.x + cell.y, 3.0);
  float phase = u_time + hash2(cell + u_seed) * 6.2831853;
  float turn = sin(phase) * 0.4398230;
  float amount = 0.2 + 0.8 * (0.5 + 0.5 * sin(phase * 0.7));
  vec2 point = mat2(cos(turn), -sin(turn), sin(turn), cos(turn)) * offset;

  float kind = u_shapes == 0 ? slot : float(u_shapes - 1);
  float field = kind < 0.5
    ? length(point) - size * 0.31 * amount
    : (kind < 1.5
        ? rs_box(point, vec2(size * 0.34, size * 0.09))
        : rs_triangle(point, size));

  float edge = max(0.75, fwidth(pixel.x));
  float cover = (1.0 - smoothstep(-edge, edge, field)) * 0.88;
  vec4 ink = slot < 0.5 ? u_colorA : u_colorB;
  float over = ink.a * cover;
  float alpha = over + u_background.a * (1.0 - over);
  vec3 rgb = (ink.rgb * over + u_background.rgb * u_background.a * (1.0 - over))
    / max(alpha, 0.0001);
  return vec4(rgb, alpha);
}`,
  create({ random }) {
    let time = random() * PERIOD;
    const seed = random() * 97;
    return {
      update({ dt, params, changed }) {
        time = (time + dt * params.speed) % PERIOD;
        return {
          changed: changed || params.speed > 0,
          blank:
            params.background[3] <= 0 &&
            params.colorA[3] <= 0 &&
            params.colorB[3] <= 0,
          uniforms: { time, seed },
        };
      },
    };
  },
});
