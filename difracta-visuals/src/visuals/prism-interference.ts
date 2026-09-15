import { defineShaderVisual } from "@difracta/render/sdk";

/** The three drifting waves come back together after this; the clock wraps there. */
const CYCLE = Math.PI * 20;

export const prismInterference = defineShaderVisual({
  id: "prism-interference",
  name: "Prism Interference",
  description:
    "Two saturated wave fields cross into fine moiré bands that drift over a dark ground, ruled by a scanline.",
  notes:
    "A dense, iridescent texture that reads as light through a diffraction grating: two wave fields at slightly different angles are multiplied by a third diagonal one, so only where all three agree does a band light up, and the pattern crawls without ever repeating on screen. Bands is the spatial frequency of all three at once, so it is the one control over how fine the texture is; low values give broad ribbons a Surface can carry from far away, high values a shimmer that needs a close Surface or it will crawl. Color A and Color B light the two fields independently and overlap into their sum, so complementary hues give the prism look and two neighbours give a single shot silk. Background is what shows between the bands and is opaque by default, so this covers the Surface; drop its alpha to let a Scene through. Scanline Pitch is the ruling laid over everything, in Output pixels, and stays the same spacing on the wall whatever the Output resolution: four pixels is a fine CRT grille, sixteen an obvious blind. Drift Speed integrates, so it can be swept live and stopped without a jump, and a stopped field costs nothing. Cheap for how busy it looks. Best alone on a large Surface, or under Shutter. Costs one full-Surface pass per frame while drifting.",
  parameters: {
    background: {
      kind: "color",
      label: "Background",
      default: [0.012, 0.02, 0.055, 1],
    },
    colorA: { kind: "color", label: "Color A", default: [1, 0.169, 0.455, 1] },
    colorB: { kind: "color", label: "Color B", default: [0.149, 0.91, 1, 1] },
    bands: {
      kind: "number",
      label: "Bands",
      default: 42,
      min: 8,
      max: 120,
      step: 1,
      description: "The spatial frequency of all three wave fields.",
    },
    speed: {
      kind: "number",
      label: "Drift Speed",
      default: 0.32,
      min: 0,
      max: 3,
      step: 0.02,
    },
    scanlinePitch: {
      kind: "number",
      label: "Scanline Pitch",
      default: 4,
      min: 2,
      max: 64,
      step: 1,
      unit: "px",
      description: "One dark-to-light ruling every this many Output pixels.",
    },
  },
  fragment: `
uniform float u_time;
uniform float u_seed;

vec4 render_visual(vec2 uv) {
  float aspect = u_resolution.x / max(1.0, u_resolution.y);
  vec2 position = (uv - 0.5) * vec2(aspect, 1.0);
  float red = sin(position.x * u_bands + position.y * 7.0 + u_time * 2.1 + u_seed * 6.2831853);
  float blue = sin(position.y * u_bands * 0.83 - position.x * 11.0 - u_time * 1.7);
  float diagonal = sin((position.x + position.y) * u_bands * 0.54 + u_time * 1.2);
  float redMask = smoothstep(0.12, 0.94, red * diagonal);
  float blueMask = smoothstep(0.04, 0.9, blue * -diagonal);
  // A real spacing on the wall: one cycle every Scanline Pitch Output pixels.
  float scan = 0.82 + 0.18 * sin(uv.y * u_resolution.y / max(u_scanlinePitch, 1.0) * 6.2831853);
  vec3 rgb = u_background.rgb;
  rgb += u_colorA.rgb * redMask * u_colorA.a;
  rgb += u_colorB.rgb * blueMask * u_colorB.a;
  rgb *= scan;
  float alpha = max(u_background.a, max(redMask * u_colorA.a, blueMask * u_colorB.a));
  return vec4(rgb, alpha);
}`,
  create({ random }) {
    let time = random() * CYCLE;
    const seed = random();
    return {
      update({ dt, params, changed }) {
        time = (time + dt * params.speed) % CYCLE;
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
