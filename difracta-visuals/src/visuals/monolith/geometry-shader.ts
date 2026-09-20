import { HALF_SIZE, SLABS } from "./assembly.ts";

/** Each ray tests the slabs' bounds before tracing only the bevels it can see. */
export const GEOMETRY_SHADER = `
const int SLABS = ${String(SLABS)};
const vec3 SLAB_SIZE = vec3(${HALF_SIZE.join(", ")});
const float BEVEL = 0.022;
const float FAR = 100.0;
uniform vec4 u_poses[SLABS];
uniform vec4 u_turns[SLABS];

vec3 mono_local(vec3 p, vec2 turn) {
  return vec3(turn.x * p.x + turn.y * p.z, p.y, -turn.y * p.x + turn.x * p.z);
}

vec3 mono_world(vec3 p, vec2 turn) {
  return vec3(turn.x * p.x - turn.y * p.z, p.y, turn.y * p.x + turn.x * p.z);
}

vec2 mono_bounds(vec3 origin, vec3 ray, vec3 size) {
  vec3 inverse = mix(vec3(-1.0), vec3(1.0), step(vec3(0.0), ray)) / max(abs(ray), vec3(1e-7));
  vec3 a = (-size - origin) * inverse;
  vec3 b = (size - origin) * inverse;
  vec3 near = min(a, b);
  vec3 far = max(a, b);
  return vec2(max(max(near.x, near.y), near.z), min(min(far.x, far.y), far.z));
}

float mono_box(vec3 p) {
  vec3 q = abs(p) - SLAB_SIZE + BEVEL;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - BEVEL;
}

struct MonolithHit {
  float travel;
  int slab;
  vec3 local;
  vec3 normal;
};

MonolithHit mono_trace(vec3 origin, vec3 ray, float pixel) {
  MonolithHit hit = MonolithHit(FAR, -1, vec3(0.0), vec3(0.0));
  int steps = u_quality == 0 ? 6 : (u_quality == 1 ? 10 : 16);
  for (int i = 0; i < SLABS; i += 1) {
    vec2 turn = u_turns[i].xy;
    vec3 ro = mono_local(origin - u_poses[i].xyz, turn);
    vec3 rd = mono_local(ray, turn);
    vec2 span = mono_bounds(ro, rd, SLAB_SIZE);
    float t = max(span.x, 0.0);
    if (span.y < t || t > hit.travel) continue;
    for (int j = 0; j < 16; j += 1) {
      if (j >= steps || t > span.y || t > hit.travel) break;
      vec3 p = ro + rd * t;
      float distance = mono_box(p);
      if (distance < max(0.0002, pixel * t * 0.25)) {
        vec3 n = normalize(max(abs(p) - SLAB_SIZE + BEVEL, 0.00001) * sign(p));
        hit = MonolithHit(t, i, p, mono_world(n, turn));
        break;
      }
      t += distance;
    }
  }
  return hit;
}

float mono_shadow(vec3 origin, vec3 ray, int own) {
  if (u_quality < 2) return 1.0;
  for (int i = 0; i < SLABS; i += 1) {
    if (i == own) continue;
    vec2 turn = u_turns[i].xy;
    vec2 span = mono_bounds(mono_local(origin - u_poses[i].xyz, turn), mono_local(ray, turn), SLAB_SIZE - BEVEL);
    if (span.y > max(span.x, 0.001)) return 0.18;
  }
  return 1.0;
}
`;
