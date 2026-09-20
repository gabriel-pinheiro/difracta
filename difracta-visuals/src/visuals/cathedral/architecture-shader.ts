import { BAY } from "./fixtures.ts";

/**
 * The GLSL of Cathedral's stone: an endless hall of pillars repeated every
 * bay along the nave and every aisle across it, in one of two
 * architectures dispatched on the Architecture option index, marched as
 * a signed distance field up to the floor and the vault, which are planes
 * the scene intersects directly.
 */
export const ARCHITECTURE = `
const float CATHEDRAL_BAY = ${String(BAY)}.0;
const float CATHEDRAL_AISLE = 9.0;
const float CATHEDRAL_FAR = 72.0;

float cathedral_box(vec3 p, vec3 size) {
  vec3 q = abs(p) - size;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float cathedral_rect(vec2 p, vec2 size) {
  vec2 q = abs(p) - size;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}

float cathedral_ceiling() {
  return u_architecture == 0 ? 12.9 : 11.0;
}

// Clustered pillars at x = 4.5 + 9k, z = 2 + 4k, with pointed ribs springing
// from their capitals across the nave and along each arcade.
float cathedral_gothic(vec3 p) {
  float px = mod(p.x, CATHEDRAL_AISLE) - 4.5;
  float pz = mod(p.z, CATHEDRAL_BAY) - 2.0;
  vec2 across = vec2(px, pz);
  float shafts = length(abs(across) - vec2(0.36)) - 0.24;
  float pillar = max(min(length(across) - 0.5, shafts), p.y - 7.2);
  float plinth = cathedral_box(vec3(px, p.y - 0.4, pz), vec3(0.8, 0.4, 0.8)) - 0.04;
  float capital = cathedral_box(vec3(px, p.y - 7.1, pz), vec3(0.72, 0.16, 0.72)) - 0.04;
  // Each half of a pointed arch is an arc centred beyond the other half.
  float ax = mod(p.x + 4.5, CATHEDRAL_AISLE) - 4.5;
  float nave_arc = length(vec2(abs(ax) + 0.9, p.y - 7.2)) - 5.4;
  float nave_rib = length(vec2(nave_arc, pz)) - 0.26;
  float bz = mod(p.z + 2.0, CATHEDRAL_BAY) - 2.0;
  float bay_arc = length(vec2(abs(bz) + 0.55, p.y - 7.2)) - 2.55;
  float bay_rib = length(vec2(bay_arc, px)) - 0.2;
  float ribs = max(min(nave_rib, bay_rib), 7.2 - p.y);
  return min(min(pillar, min(plinth, capital)), ribs);
}

// Concrete fins standing across the nave, each pierced by a tall slot,
// carrying deep girders under a flat slab.
float cathedral_brutalist(vec3 p) {
  float px = mod(p.x, CATHEDRAL_AISLE) - 4.5;
  float pz = mod(p.z, CATHEDRAL_BAY) - 2.0;
  float fin = max(cathedral_rect(vec2(px, pz), vec2(1.3, 0.42)), p.y - 10.4);
  fin = max(fin, -cathedral_rect(vec2(px, p.y - 5.2), vec2(0.26, 3.4)));
  float girder_x = cathedral_rect(vec2(p.y - 10.4, pz), vec2(0.6, 0.55));
  float girder_z = cathedral_rect(vec2(p.y - 10.4, px), vec2(0.6, 0.35));
  float plinth = cathedral_box(vec3(px, p.y - 0.3, pz), vec3(1.7, 0.3, 0.8));
  return min(min(fin, plinth), min(girder_x, girder_z));
}

float cathedral_map(vec3 p) {
  return u_architecture == 0 ? cathedral_gothic(p) : cathedral_brutalist(p);
}

int cathedral_steps() {
  return u_quality == 0 ? 36 : (u_quality == 1 ? 56 : 88);
}

// Distance along rd to the stone; far when nothing is nearer. A march that
// runs out of steps stops where it got to, which reads as stone in the haze.
float cathedral_march(vec3 ro, vec3 rd, float far, int steps) {
  float t = 0.05;
  for (int i = 0; i < 88; i += 1) {
    if (i >= steps || t >= far) break;
    float d = cathedral_map(ro + rd * t);
    if (d < 0.0015 * t + 0.002) return t;
    t += d;
  }
  return min(t, far);
}

vec3 cathedral_normal(vec3 p, float t) {
  float e = 0.003 + t * 0.001;
  vec2 k = vec2(1.0, -1.0);
  return normalize(
    k.xyy * cathedral_map(p + k.xyy * e) +
    k.yyx * cathedral_map(p + k.yyx * e) +
    k.yxy * cathedral_map(p + k.yxy * e) +
    k.xxx * cathedral_map(p + k.xxx * e));
}

float cathedral_occlusion(vec3 p, vec3 n) {
  if (u_quality == 0) return 1.0;
  float near = cathedral_map(p + n * 0.4) / 0.4;
  float wide = u_quality == 2 ? cathedral_map(p + n * 1.2) / 1.2 : near;
  return clamp(0.3 + 0.7 * min(near, wide), 0.0, 1.0);
}
`;
