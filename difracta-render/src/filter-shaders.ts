import type { ParameterDefinition, ParameterSchema } from "@difracta/core";

import type { ShaderFilter } from "./sdk/filter.ts";

/**
 * The GLSL around a Filter's fragment. A pass draws one quad over its
 * input, the accumulated frame for a root Filter Layer or a Visual Layer's
 * picture in its Target for a nested one; the fragment reads it as
 * `u_input`, premultiplied, and defines `filter_image`, and the wrapper
 * applies the Layer's mix and keeps the result premultiplied. A Filter
 * that changes colour works in straight alpha (`sample_straight`,
 * `unpremultiply`) and returns `premultiply(...)`.
 */
export const FILTER_VERTEX_SOURCE = `#version 300 es
in vec2 a_uv;
out vec2 v_uv;

void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_uv * 2.0 - 1.0, 0.0, 1.0);
}
`;

/** Copies a texture whole: the last frame target to the screen, or a Layer's picture into its chain, turned over when `u_flip` is 1. */
export const PRESENT_FRAGMENT_SOURCE = `#version 300 es
precision highp float;
uniform sampler2D u_input;
uniform int u_flip;
in vec2 v_uv;
out vec4 o_color;

void main() {
  o_color = texture(u_input, u_flip == 1 ? vec2(v_uv.x, 1.0 - v_uv.y) : v_uv);
}
`;

const PRELUDE = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_input;
uniform vec2 u_resolution;
uniform vec2 u_texel;
uniform float u_mix;
in vec2 v_uv;
out vec4 o_color;

vec4 sample_input(vec2 uv) {
  return texture(u_input, clamp(uv, vec2(0.0), vec2(1.0)));
}

vec2 mirror_uv(vec2 uv) {
  return 1.0 - abs(mod(uv, 2.0) - 1.0);
}

vec4 sample_mirrored(vec2 uv) {
  return texture(u_input, mirror_uv(uv));
}

vec4 unpremultiply(vec4 c) {
  return c.a > 0.0 ? vec4(c.rgb / c.a, c.a) : vec4(0.0);
}

vec4 premultiply(vec4 c) {
  return vec4(c.rgb * c.a, c.a);
}

vec4 sample_straight(vec2 uv) {
  return unpremultiply(sample_input(uv));
}

float hash(float value) {
  return fract(sin(value * 127.1 + 311.7) * 43758.5453);
}

float hash2(vec2 value) {
  return fract(sin(dot(value, vec2(127.1, 311.7))) * 43758.5453);
}
`;

const MAIN = `
void main() {
  vec4 source = texture(u_input, v_uv);
  vec4 filtered = clamp(filter_image(v_uv), 0.0, 1.0);
  filtered.rgb = min(filtered.rgb, vec3(filtered.a));
  o_color = mix(source, filtered, u_mix);
}
`;

export function uniformName(name: string): string {
  return `u_${name}`;
}

/** The GLSL type a Parameter is handed to the fragment as; a media or text Parameter has no uniform of its own. */
export function uniformType(
  definition: ParameterDefinition,
): "float" | "vec4" | "int" | "bool" | undefined {
  switch (definition.kind) {
    case "number":
      return "float";
    case "color":
      return "vec4";
    case "choice":
      return "int";
    case "boolean":
      return "bool";
    case "media":
    case "text":
      return undefined;
  }
}

export function parameterDeclarations(schema: ParameterSchema): string {
  return Object.entries(schema)
    .flatMap(([name, definition]) => {
      const type = uniformType(definition);
      return type === undefined
        ? []
        : [`uniform ${type} ${uniformName(name)};`];
    })
    .join("\n");
}

export function filterFragmentSource(filter: ShaderFilter): string {
  return `${PRELUDE}${parameterDeclarations(filter.parameters)}\n${filter.fragment}\n${MAIN}`;
}
