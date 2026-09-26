import type { ParameterDefinition, ParameterValues } from "@difracta/core";

import { parameterDeclarations, uniformName } from "./filter-shaders.ts";
import { compileProgram, setUniform, uniform } from "./gl.ts";
import { errorMessage } from "./issues.ts";
import type { MediaTextures } from "./media-textures.ts";
import type { Textures } from "./sdk/media.ts";
import {
  pathDeclarations,
  pathUniformPoints,
  type PathShapes,
} from "./sdk/path.ts";
import type { ShaderVisual } from "./sdk/shader-visual.ts";
import type { ShaderBuffer } from "./shader-buffers.ts";
import type { Uniforms } from "./sdk/uniforms.ts";
import { EDGE_COVERAGE_SOURCE, VERTEX_SOURCE } from "./shaders.ts";
import { WHOLE, type Rect } from "./surface-program.ts";

/** One shader Layer to draw this frame, with everything its program needs. */
export interface ShaderDrawInput {
  readonly visual: ShaderVisual;
  /** The Layer's values completed with the schema defaults. */
  readonly params: ParameterValues;
  readonly uniforms: Uniforms;
  /** The Media handles the instance samples, bound as `u_<name>` with `u_<name>_size`. */
  readonly textures: Textures;
  /** The Paths the Visual declares, by key, in the Target's space. */
  readonly paths: PathShapes;
  /** The Target's size in frame pixels, what `u_resolution` reports. */
  readonly width: number;
  readonly height: number;
  readonly opacity: number;
  readonly homography: Float32Array;
  readonly maskTexture: WebGLTexture | undefined;
  /** The Target inside Surface Space, which the Mask texture covers. */
  readonly maskRect: Rect;
}

/** What a draw into a Layer's buffer needs; the buffer decides the rest. */
export type BufferDrawInput = Pick<
  ShaderDrawInput,
  "visual" | "params" | "uniforms" | "textures" | "paths"
>;

/**
 * Surface Space straight onto a whole buffer, rows top first like an
 * uploaded canvas, so the buffer composites exactly as a canvas Layer's
 * texture does.
 */
const BUFFER_HOMOGRAPHY = new Float32Array([1, 0, 0, 0, -1, 0, 0, 1, 1]);

interface ProgramEntry {
  readonly program: WebGLProgram;
  readonly homography: WebGLUniformLocation;
  readonly maskRect: WebGLUniformLocation;
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
uniform vec4 u_mask_rect;
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
${EDGE_COVERAGE_SOURCE}`;

// The Target's edge fades the Visual out like the Masks cut it; the Mask
// texture clamps past the edge, so the coverage alone decides there. The
// Mask is in Surface Space, sampled through the Target's rectangle.
const MAIN = `
void main() {
  float mask = u_mask_enabled == 1
    ? texture(u_mask, u_mask_rect.xy + v_uv * u_mask_rect.zw).a
    : 1.0;
  vec4 color = clamp(render_visual(v_uv), 0.0, 1.0);
  color.rgb *= color.a;
  o_color = color * u_opacity * mask * edgeCoverage(v_uv);
}
`;

export function visualFragmentSource(visual: ShaderVisual): string {
  return `${PRELUDE}${parameterDeclarations(visual.parameters)}\n${pathDeclarations(visual.paths)}\n${visual.fragment}\n${MAIN}`;
}

/**
 * Draws shader Visuals: one program per Visual, compiled on first use and
 * kept, run over the Surface's quad through the same vertex shader as
 * everything else so the fragment sees Surface Space. A Visual that fails
 * to compile is logged once and skipped; `failure` tells the compositor
 * why, so every Layer using it is reported as an issue. The Media handles
 * an instance returns go on the texture units after the mask's, each as
 * the sampler `u_<name>` and the vec2 `u_<name>_size` the fragment
 * declares.
 */
export class ShaderVisualPrograms {
  readonly #gl: WebGL2RenderingContext;
  readonly #quad: WebGLBuffer;
  readonly #unit: WebGLBuffer;
  readonly #media: MediaTextures;
  readonly #programs = new Map<string, ProgramEntry | undefined>();
  readonly #failures = new Map<string, string>();

  /**
   * `quad` is the Surface program's current Surface quad, set before each
   * draw; `unit` its unit quad, which a buffer is filled with.
   */
  constructor(
    gl: WebGL2RenderingContext,
    quad: WebGLBuffer,
    unit: WebGLBuffer,
    media: MediaTextures,
  ) {
    this.#gl = gl;
    this.#quad = quad;
    this.#unit = unit;
    this.#media = media;
  }

  /** Draws with the current blend function; the mask goes on texture unit 0. */
  draw(input: ShaderDrawInput): void {
    this.#run(input, this.#quad);
  }

  /**
   * Renders into a Layer's buffer at the buffer's size, unmasked and at full
   * opacity, and leaves it bound; the compositor then draws the buffer over
   * the Surface with the Layer's opacity, blend mode and Masks.
   */
  render(buffer: ShaderBuffer, input: BufferDrawInput): void {
    const gl = this.#gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, buffer.framebuffer);
    gl.viewport(0, 0, buffer.width, buffer.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.#run(
      {
        ...input,
        width: buffer.width,
        height: buffer.height,
        opacity: 1,
        homography: BUFFER_HOMOGRAPHY,
        maskTexture: undefined,
        maskRect: WHOLE,
      },
      this.#unit,
    );
  }

  #run(input: ShaderDrawInput, quad: WebGLBuffer): void {
    const entry = this.#program(input.visual);
    if (entry === undefined) return;
    const gl = this.#gl;
    gl.useProgram(entry.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input.maskTexture ?? null);
    gl.uniform1i(entry.maskEnabled, input.maskTexture === undefined ? 0 : 1);
    gl.uniformMatrix3fv(entry.homography, false, input.homography);
    gl.uniform4f(entry.rect, 0, 0, 1, 1);
    gl.uniform4f(entry.maskRect, ...input.maskRect);
    gl.uniform1f(entry.opacity, input.opacity);
    gl.uniform2f(entry.resolution, input.width, input.height);
    gl.uniform2f(entry.texel, 1 / input.width, 1 / input.height);
    for (const [name, definition] of Object.entries(input.visual.parameters))
      this.#setParameter(entry, name, definition, input.params[name]);
    for (const { key } of input.visual.paths ?? [])
      this.#setPath(entry, key, input.paths[key]);
    for (const [name, value] of Object.entries(input.uniforms)) {
      const location = this.#location(entry, name);
      if (location !== null) setUniform(gl, location, value);
    }
    let unit = 1;
    for (const [name, handle] of Object.entries(input.textures)) {
      const sampler = this.#location(entry, name);
      const size = this.#location(entry, `${name}_size`);
      if (sampler === null && size === null) continue;
      gl.activeTexture(gl.TEXTURE0 + unit);
      this.#media.bind(handle);
      if (sampler !== null) gl.uniform1i(sampler, unit);
      if (size !== null) gl.uniform2f(size, handle.width, handle.height);
      unit += 1;
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  /** Why the Visual's program did not compile, once a draw has tried it. */
  failure(visualId: string): string | undefined {
    return this.#failures.get(visualId);
  }

  dispose(): void {
    for (const entry of this.#programs.values())
      if (entry !== undefined) this.#gl.deleteProgram(entry.program);
    this.#programs.clear();
    this.#failures.clear();
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
        maskRect: uniform(gl, program, "u_mask_rect"),
        maskEnabled: uniform(gl, program, "u_mask_enabled"),
        opacity: uniform(gl, program, "u_opacity"),
        resolution: gl.getUniformLocation(program, "u_resolution"),
        texel: gl.getUniformLocation(program, "u_texel"),
        locations: new Map(),
      };
    } catch (error: unknown) {
      console.error(`Visual “${visual.id}” cannot run:`, error);
      this.#failures.set(visual.id, errorMessage(error));
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

  #setPath(
    entry: ProgramEntry,
    key: string,
    shape: PathShapes[string] | undefined,
  ): void {
    const gl = this.#gl;
    const points = this.#location(entry, `path_${key}_points`);
    const count = this.#location(entry, `path_${key}_count`);
    const closed = this.#location(entry, `path_${key}_closed`);
    if (points !== null)
      gl.uniform2fv(
        points,
        pathUniformPoints(shape ?? { points: [], closed: false }),
      );
    if (count !== null) gl.uniform1i(count, shape?.points.length ?? 0);
    if (closed !== null) gl.uniform1i(closed, shape?.closed === true ? 1 : 0);
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
      case "media":
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
