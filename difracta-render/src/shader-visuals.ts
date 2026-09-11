import type { ParameterDefinition, ParameterValues } from "@difracta/core";

import { parameterDeclarations, uniformName } from "./filter-shaders.ts";
import { compileProgram, setUniform, uniform } from "./gl.ts";
import type { ShaderVisual } from "./sdk/shader-visual.ts";
import type { Uniforms } from "./sdk/uniforms.ts";
import { VERTEX_SOURCE } from "./shaders.ts";

/** One shader Layer to draw this frame, with everything its program needs. */
export interface ShaderDrawInput {
  readonly visual: ShaderVisual;
  /** The Layer's values completed with the schema defaults. */
  readonly params: ParameterValues;
  readonly uniforms: Uniforms;
  /** The Surface's size in frame pixels, what `u_resolution` reports. */
  readonly width: number;
  readonly height: number;
  readonly opacity: number;
  readonly homography: Float32Array;
  readonly maskTexture: WebGLTexture | undefined;
}

interface ProgramEntry {
  readonly program: WebGLProgram;
  readonly homography: WebGLUniformLocation;
  readonly rect: WebGLUniformLocation;
  readonly maskEnabled: WebGLUniformLocation;
  readonly opacity: WebGLUniformLocation;
  readonly resolution: WebGLUniformLocation | null;
  readonly texel: WebGLUniformLocation | null;
  readonly locations: Map<string, WebGLUniformLocation | null>;
}

const PRELUDE = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_mask;
uniform int u_mask_enabled;
uniform float u_opacity;
uniform vec2 u_resolution;
uniform vec2 u_texel;
in vec2 v_uv;
in vec2 v_local;
out vec4 o_color;

float hash(float value) {
  return fract(sin(value * 127.1 + 311.7) * 43758.5453);
}

float hash2(vec2 value) {
  return fract(sin(dot(value, vec2(127.1, 311.7))) * 43758.5453);
}
`;

const MAIN = `
void main() {
  float mask = u_mask_enabled == 1 ? texture(u_mask, v_uv).a : 1.0;
  vec4 color = clamp(render_visual(v_uv), 0.0, 1.0);
  color.rgb *= color.a;
  o_color = color * u_opacity * mask;
}
`;

export function visualFragmentSource(visual: ShaderVisual): string {
  return `${PRELUDE}${parameterDeclarations(visual.parameters)}\n${visual.fragment}\n${MAIN}`;
}

/**
 * Draws shader Visuals: one program per Visual, compiled on first use and
 * kept, run over the Surface's quad through the same vertex shader as
 * everything else so the fragment sees Surface Space. A Visual that fails
 * to compile is reported once and skipped.
 */
export class ShaderVisualPrograms {
  readonly #gl: WebGL2RenderingContext;
  readonly #quad: WebGLBuffer;
  readonly #programs = new Map<string, ProgramEntry | undefined>();

  constructor(gl: WebGL2RenderingContext, quad: WebGLBuffer) {
    this.#gl = gl;
    this.#quad = quad;
  }

  /** Draws with the current blend function; the mask goes on texture unit 0. */
  draw(input: ShaderDrawInput): void {
    const entry = this.#program(input.visual);
    if (entry === undefined) return;
    const gl = this.#gl;
    gl.useProgram(entry.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input.maskTexture ?? null);
    gl.uniform1i(entry.maskEnabled, input.maskTexture === undefined ? 0 : 1);
    gl.uniformMatrix3fv(entry.homography, false, input.homography);
    gl.uniform4f(entry.rect, 0, 0, 1, 1);
    gl.uniform1f(entry.opacity, input.opacity);
    gl.uniform2f(entry.resolution, input.width, input.height);
    gl.uniform2f(entry.texel, 1 / input.width, 1 / input.height);
    for (const [name, definition] of Object.entries(input.visual.parameters))
      this.#setParameter(entry, name, definition, input.params[name]);
    for (const [name, value] of Object.entries(input.uniforms)) {
      const location = this.#location(entry, name);
      if (location !== null) setUniform(gl, location, value);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#quad);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  dispose(): void {
    for (const entry of this.#programs.values())
      if (entry !== undefined) this.#gl.deleteProgram(entry.program);
    this.#programs.clear();
  }

  #program(visual: ShaderVisual): ProgramEntry | undefined {
    if (this.#programs.has(visual.id)) return this.#programs.get(visual.id);
    const gl = this.#gl;
    let entry: ProgramEntry | undefined;
    try {
      const program = compileProgram(
        gl,
        VERTEX_SOURCE,
        visualFragmentSource(visual),
      );
      gl.useProgram(program);
      gl.uniform1i(uniform(gl, program, "u_mask"), 0);
      entry = {
        program,
        homography: uniform(gl, program, "u_homography"),
        rect: uniform(gl, program, "u_rect"),
        maskEnabled: uniform(gl, program, "u_mask_enabled"),
        opacity: uniform(gl, program, "u_opacity"),
        resolution: gl.getUniformLocation(program, "u_resolution"),
        texel: gl.getUniformLocation(program, "u_texel"),
        locations: new Map(),
      };
    } catch (error: unknown) {
      console.error(`Visual “${visual.id}” cannot run:`, error);
    }
    this.#programs.set(visual.id, entry);
    return entry;
  }

  #location(entry: ProgramEntry, name: string): WebGLUniformLocation | null {
    const cached = entry.locations.get(name);
    if (cached !== undefined) return cached;
    const location = this.#gl.getUniformLocation(
      entry.program,
      uniformName(name),
    );
    entry.locations.set(name, location);
    return location;
  }

  #setParameter(
    entry: ProgramEntry,
    name: string,
    definition: ParameterDefinition,
    value: unknown,
  ): void {
    const location = this.#location(entry, name);
    if (location === null) return;
    const gl = this.#gl;
    switch (definition.kind) {
      case "number":
        gl.uniform1f(location, typeof value === "number" ? value : 0);
        return;
      case "boolean":
        gl.uniform1i(location, value === true ? 1 : 0);
        return;
      case "choice":
        gl.uniform1i(
          location,
          Math.max(
            0,
            definition.options.findIndex((option) => option.value === value),
          ),
        );
        return;
      case "color": {
        const [r = 0, g = 0, b = 0, a = 1] = Array.isArray(value)
          ? (value as number[])
          : [];
        gl.uniform4f(location, r, g, b, a);
      }
    }
  }
}
