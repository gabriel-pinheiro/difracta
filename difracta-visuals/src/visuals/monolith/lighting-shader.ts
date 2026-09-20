/** Dark machined faces, grazing softboxes, lit inner faces and recessed seam strips. */
export const LIGHTING_SHADER = `
uniform float u_opening;
uniform float u_tension;
uniform float u_solo;
uniform float u_charge;
uniform float u_flash;
uniform float u_impact;
uniform vec3 u_key_light;
uniform vec3 u_fill_light;
uniform float u_scan;

vec3 mono_core_color() { return u_coreColor.rgb * u_coreColor.a; }
vec3 mono_key_color() { return u_rimColorA.rgb * u_rimColorA.a; }
vec3 mono_fill_color() { return u_rimColorB.rgb * u_rimColorB.a; }

vec3 mono_metal(MonolithHit hit, vec3 origin, vec3 ray) {
  vec3 p = origin + ray * hit.travel;
  vec3 n = hit.normal;
  vec3 local = hit.local;
  vec3 local_n = mono_local(n, u_turns[hit.slab].xy);
  vec3 bounce = reflect(ray, n);
  float wave = u_poses[hit.slab].w;
  float row = u_turns[hit.slab].z;
  float solo = exp(-pow((row - u_scan) * 7.0, 2.0));
  float level = mix(0.7 + u_charge * 0.5, 0.04 + solo * 1.5, u_solo);
  float key = max(dot(n, u_key_light), 0.0);
  float fill = max(dot(n, u_fill_light), 0.0);
  float shadow = mono_shadow(p + n * 0.006, u_key_light, hit.slab);
  float occlusion = mix(0.38, 1.0, clamp(u_opening * 1.7, 0.0, 1.0));
  occlusion = mix(1.0, occlusion, abs(n.y));
  vec3 a = mono_key_color();
  vec3 b = mono_fill_color();
  vec3 core = mono_core_color();
  float spec_a = pow(max(dot(bounce, u_key_light), 0.0), 38.0);
  float spec_b = pow(max(dot(bounce, u_fill_light), 0.0), 32.0);
  float fresnel = pow(1.0 - max(dot(n, -ray), 0.0), 3.0);
  vec3 color = (a * (key * 0.06 + spec_a * 3.0) * shadow
    + b * (fill * 0.035 + spec_b * 2.0)) * occlusion * level;
  color += (a * key + b * fill) * fresnel * 0.45 * level;
  // Broad neutral reflections read as polished graphite between the narrow lights.
  color += (a + b * 0.25) * pow(max(bounce.y, 0.0), 2.0) * 0.16 * occlusion * level;

  // Recessed horizontal cuts stay fixed to each face.
  float front = smoothstep(0.5, 0.9, abs(local_n.z));
  float edge = abs(local.y) - 0.116;
  float aa = max(fwidth(edge), 0.0008);
  float seam = (1.0 - smoothstep(0.0015, 0.0015 + aa, abs(edge)))
    * (1.0 - smoothstep(0.37, 0.4, abs(local.x)));
  float fine = sin(local.x * 540.0) * sin(local.y * 360.0);
  float grain = 1.0 + fine * 0.06 * (1.0 - smoothstep(0.001, 0.006, fwidth(local.x)));
  color *= grain * (1.0 - seam * front * 0.7);
  float inward = max(local_n.x * (u_turns[hit.slab].w < 0.5 ? 1.0 : -1.0), 0.0);
  float inner_edge = exp(-abs(abs(local.y) - 0.12) * 160.0);
  float vent = pow(0.5 + 0.5 * cos(local.z * 90.0), 16.0);
  float inner_light = inward * (0.025 + inner_edge * 1.2 + vent * 0.12)
    * (0.4 + u_charge * 0.9 + wave * 1.5);
  float strip = seam * front * (0.035 + wave * 2.0 + u_tension * 0.12);
  color += core * (inner_light + strip) * mix(1.0, solo * 0.7 + 0.025, u_solo);
  float inside_x = local.x * (u_turns[hit.slab].w < 0.5 ? 1.0 : -1.0);
  float slit = exp(-abs(inside_x - 0.435) * 220.0) * front;
  color += core * slit * (0.1 + u_tension * 3.0 + wave) * (1.0 - u_solo * 0.98);
  color += core * max(local_n.y, 0.0) * 0.06 * u_opening * (1.0 + wave);
  // A flash lights the object and its bevels; the surrounding black stays black.
  color += vec3(u_flash) * (0.12 + key * 0.65 + spec_a * 2.0 + seam * front * 2.0);
  return color;
}

// Closest point on the visible view segment to the luminous spine.
vec3 mono_haze(vec3 ro, vec3 rd, float limit) {
  float t = clamp(-dot(ro.xz, rd.xz) / max(dot(rd.xz, rd.xz), 0.00001), 0.0, limit);
  vec3 p = ro + rd * t;
  float radius = length(p.xz);
  float extent = 1.0 - smoothstep(1.6, 2.9, abs(p.y));
  float halo = exp(-radius * 3.5) * extent;
  float wide = exp(-radius * 1.15) * extent * 0.12;
  float solo = exp(-pow((p.y - (u_scan - 0.5) * 4.0) * 2.0, 2.0));
  float level = mix(0.1 + u_charge * 0.16, solo * 0.06, u_solo);
  return (mono_core_color() * level + vec3(u_flash * 0.08)) * (halo + wide) * u_glow;
}
`;
