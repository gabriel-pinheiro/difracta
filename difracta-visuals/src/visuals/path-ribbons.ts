import { defineShaderVisual } from "@difracta/render/sdk";

/** Ribbons the fragment can loop over; the Parameter's maximum. */
const MAX_RIBBONS = 12;

export const pathRibbons = defineShaderVisual({
  id: "path-ribbons",
  name: "Path Ribbons",
  description:
    "Glowing ribbons weave in and out of a Path, crossing it on a travelling sine.",
  notes:
    "A braid laid along a Path: Ribbons bands, each Thickness pixels across with a soft glow of about three times that, swing from one side of the Path to the other on a sine. Weave is how far the outermost ribbon reaches in pixels; the inner ones take an even share of it, so four ribbons sit at a quarter and three quarters of Weave on each side and they cross the Path together. Waves is how many swings fit around the whole Path, so a longer Path wants more of them or the braid stretches into lazy curves; Weave and Waves are what make it read as a braid rather than parallel lines. Speed is in swings per second times a constant and integrates, so changing it live never jumps; at zero the braid freezes into a static weave and the Layer costs nothing to recomposite. Ribbons alternate between the two colours and brighten toward the outside, so the outermost pair leads the eye. Whole waves keep the braid seamless where a closed Path meets itself. On an open Path the ribbons round off just past the first and last points instead of wrapping, which reads as a tied end. The fragment walks every segment of the Path once per pixel and then every ribbon, so it costs one full-Surface pass per frame and scales with Ribbons. Additive blend mode over a dark Scene is what makes the crossings bloom.",
  parameters: {
    colorA: {
      kind: "color",
      label: "Ribbon Color A",
      default: [1, 0.149, 0.51, 1],
    },
    colorB: {
      kind: "color",
      label: "Ribbon Color B",
      default: [0.118, 0.882, 1, 1],
    },
    weave: {
      kind: "number",
      label: "Weave",
      default: 28,
      min: 2,
      max: 200,
      step: 1,
      unit: "px",
      description: "How far the outermost ribbon swings off the Path.",
    },
    thickness: {
      kind: "number",
      label: "Thickness",
      default: 3,
      min: 0.5,
      max: 40,
      step: 0.5,
      unit: "px",
    },
    ribbons: {
      kind: "number",
      label: "Ribbons",
      default: 4,
      min: 1,
      max: MAX_RIBBONS,
      step: 1,
    },
    waves: {
      kind: "number",
      label: "Waves",
      default: 8,
      min: 1,
      max: 40,
      step: 1,
      description: "Swings of the braid around the whole Path.",
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
  paths: [{ key: "path", label: "Motion Path" }],
  fragment: `
uniform float u_time;

float ribbons_segment_distance(vec2 point, vec2 start, vec2 end, out float along) {
  vec2 segment = end - start;
  float lengthSquared = max(dot(segment, segment), 0.000001);
  along = clamp(dot(point - start, segment) / lengthSquared, 0.0, 1.0);
  return length(point - (start + segment * along));
}

// Signed distance to the Path, positive on the right of travel, and the
// fraction of its length at the nearest place. Measured in pixels, so a
// ribbon swings as far on a tall Surface as on a wide one; the sign is what
// lets a ribbon sit on one side of the Path and cross to the other.
void ribbons_path_metrics(vec2 uv, out float signedDistance, out float pathPosition) {
  vec2 point = uv * u_resolution;
  int segmentCount = u_path_path_count - 1 + (u_path_path_closed ? 1 : 0);
  float accumulatedLength = 0.0;
  float closestLength = 0.0;
  float nearest = 1.0e9;
  float side = 1.0;
  for (int index = 0; index < 16; index += 1) {
    if (index >= segmentCount) break;
    int nextIndex = (index + 1) % u_path_path_count;
    vec2 start = u_path_path_points[index] * u_resolution;
    vec2 end = u_path_path_points[nextIndex] * u_resolution;
    vec2 segment = end - start;
    float segmentLength = length(segment);
    float along = 0.0;
    float candidate = ribbons_segment_distance(point, start, end, along);
    if (candidate < nearest) {
      nearest = candidate;
      closestLength = accumulatedLength + segmentLength * along;
      vec2 offset = point - start;
      side = segment.x * offset.y - segment.y * offset.x >= 0.0 ? 1.0 : -1.0;
    }
    accumulatedLength += segmentLength;
  }
  signedDistance = nearest * side;
  pathPosition = closestLength / max(accumulatedLength, 0.000001);
}

vec4 render_visual(vec2 uv) {
  float signedDistance = 0.0;
  float pathPosition = 0.0;
  ribbons_path_metrics(uv, signedDistance, pathPosition);

  int count = int(max(1.0, floor(u_ribbons + 0.5)));
  float lanes = float(count);
  float waves = max(1.0, floor(u_waves + 0.5));
  float phase = (pathPosition * waves - u_time) * 6.28318;
  float radius = max(u_thickness, 0.0001) * 0.5;

  vec3 rgb = vec3(0.0);
  float alpha = 0.0;
  for (int index = 0; index < ${String(MAX_RIBBONS)}; index += 1) {
    if (index >= count) break;
    // Lanes share Weave evenly and straddle the Path: four of them sit at a
    // quarter and three quarters of it on each side.
    float lane = ((float(index) + 0.5) / lanes - 0.5) * 2.0;
    float offset = sin(phase + float(index) * 1.3) * u_weave * lane;
    float across = abs(signedDistance - offset);
    float core = 1.0 - smoothstep(radius, radius + 1.0, across);
    float glow = exp(-across / max(radius * 3.0, 0.0001));
    vec4 color = mod(float(index), 2.0) < 1.0 ? u_colorA : u_colorB;
    float outward = 0.55 + 0.45 * float(index) / max(1.0, lanes - 1.0);
    float strength = (core + glow * 0.45) * outward * color.a;
    rgb += color.rgb * strength;
    alpha += strength;
  }
  return vec4(rgb, clamp(alpha, 0.0, 1.0));
}`,
  create() {
    let time = 0;
    return {
      update({ dt, params, changed }) {
        // Swings per second at Speed one; wrapped, so the phase never grows.
        time = (time + dt * params.speed * 0.4775) % 1;
        return {
          blank: params.colorA[3] <= 0 && params.colorB[3] <= 0,
          changed: changed || params.speed > 0,
          uniforms: { time },
        };
      },
    };
  },
});
