import {
  automaticRate,
  defineShaderVisual,
  rateTimer,
} from "@difracta/render/sdk";

/** Sweeps in flight at once; the fragment reads this many heads. */
const MAX_SWEEPS = 16;

export const lightSweep = defineShaderVisual({
  id: "light-sweep",
  name: "Light Sweep",
  description:
    "A bright band with a fading tail crosses the Surface at any angle, on its own or on a Cue, with several in flight at once.",
  notes:
    "The plainest big gesture there is: a band of light travels across the Surface along Angle, dragging a tail behind its head. Sweeps is how many run at once, evenly spaced along the way across, so one is a lone searchlight and six is a moving grille; set it to zero and nothing runs until Sweep fires, which is the busking setup — every Sweep Cue launches an extra band that travels once and is gone, and Automatic Rate fires those on its own. Band Width, Trail and Edge Softness are all shares of the way across, so the look holds on any Surface; Trail past a third turns each band into a comet and the bands start to overlap into a wash. Every band, played or free-running, travels at Speed, so Speed at zero freezes the whole picture in place and costs nothing; Speed integrates, so it can be swept live without the bands teleporting. Bands take the brightest of whatever overlaps rather than adding, so it stays clean over a busy Scene. Additive blend mode over Ribbon Current or Conveyor is the usual home. Costs one full-Surface pass per frame while anything is crossing, nothing when nothing is.",
  parameters: {
    color: { kind: "color", label: "Color", default: [1, 1, 1, 1] },
    angle: {
      kind: "number",
      label: "Angle",
      default: 0,
      min: 0,
      max: 360,
      step: 5,
      unit: "°",
      description: "0° travels left to right, 90° top to bottom.",
    },
    speed: {
      kind: "number",
      label: "Speed",
      default: 0.45,
      min: 0,
      max: 4,
      step: 0.05,
      description: "Crossings per second, for every band in flight.",
    },
    count: {
      kind: "number",
      label: "Sweeps",
      default: 1,
      min: 0,
      max: 8,
      step: 1,
      description:
        "Free-running bands, evenly spaced; zero leaves it to the Cue.",
    },
    width: {
      kind: "number",
      label: "Band Width",
      default: 0.12,
      min: 0.01,
      max: 0.6,
      step: 0.01,
      percent: true,
      description: "The band's thickness as a share of the way across.",
    },
    trail: {
      kind: "number",
      label: "Trail",
      default: 0.3,
      min: 0,
      max: 1,
      step: 0.05,
      percent: true,
      description: "How far behind the head the light lingers.",
    },
    softness: {
      kind: "number",
      label: "Edge Softness",
      default: 0.025,
      min: 0,
      max: 0.2,
      step: 0.005,
      percent: true,
    },
    automaticRate: automaticRate({ default: 0, max: 8, step: 0.1 }),
  },
  cues: [{ key: "sweep", label: "Sweep" }],
  fragment: `
uniform float u_heads[${String(MAX_SWEEPS)}];
uniform float u_head_count;

vec4 render_visual(vec2 uv) {
  float radians_angle = radians(u_angle);
  vec2 direction = vec2(cos(radians_angle), sin(radians_angle));
  float coordinate = dot(uv - 0.5, direction) + 0.5;
  float light = 0.0;
  for (int index = 0; index < ${String(MAX_SWEEPS)}; index += 1) {
    if (float(index) >= u_head_count) break;
    float behind = u_heads[index] - coordinate;
    float core = 1.0 - smoothstep(u_width - u_softness, u_width + u_softness, abs(behind));
    float trail = behind < 0.0 || u_trail <= 0.0
      ? 0.0
      : pow(max(0.0, 1.0 - behind / u_trail), 2.0);
    light = max(light, max(core, trail));
  }
  return vec4(u_color.rgb, u_color.a * clamp(light, 0.0, 1.0));
}`,
  create({ random }) {
    const timer = rateTimer(random);
    // The free-running train rides one phase; every Cue adds a band of its own.
    let phase = random();
    const played: number[] = [];
    return {
      cue() {
        played.push(0);
        while (played.length > MAX_SWEEPS) played.shift();
      },
      update({ dt, params, changed }) {
        const step = dt * params.speed;
        const before = played.length;
        for (
          let fired = timer.advance(dt, params.automaticRate);
          fired > 0;
          fired -= 1
        ) {
          played.push(0);
          while (played.length > MAX_SWEEPS) played.shift();
        }
        const added = played.length - before;
        phase = (phase + step) % 1;
        let retired = false;
        for (let index = played.length - 1; index >= 0; index -= 1) {
          const progress = (played[index] ?? 0) + step;
          if (progress >= 1) {
            played.splice(index, 1);
            retired = true;
          } else played[index] = progress;
        }
        // A band's head runs from just behind one edge to just past the other.
        const span = 1 + params.width + params.trail;
        const heads = new Float32Array(MAX_SWEEPS);
        let head = 0;
        const place = (progress: number): void => {
          if (head >= MAX_SWEEPS) return;
          heads[head] = progress * span - params.trail;
          head += 1;
        };
        const train = Math.min(params.count, MAX_SWEEPS);
        for (let index = 0; index < train; index += 1)
          place((phase + index / train) % 1);
        for (const progress of played) place(progress);
        return {
          changed:
            changed || added > 0 || retired || (params.speed > 0 && head > 0),
          blank: head === 0 || params.color[3] <= 0,
          uniforms: { heads, head_count: head },
        };
      },
    };
  },
});
