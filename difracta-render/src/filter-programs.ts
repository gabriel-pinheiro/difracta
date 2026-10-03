import type { ParameterDefinition } from "@difracta/core";

import type { FilterPass } from "./filter-players.ts";
import {
  FILTER_VERTEX_SOURCE,
  filterFragmentSource,
  PRESENT_FRAGMENT_SOURCE,
  uniformName,
} from "./filter-shaders.ts";
import { compileProgram, setUniform, uniform } from "./gl.ts";
import { errorMessage } from "./issues.ts";

interface ProgramEntry {
  readonly program: WebGLProgram;
  readonly resolution: WebGLUniformLocation | null;
  readonly texel: WebGLUniformLocation | null;
  readonly mix: WebGLUniformLocation;
  readonly locations: Map<string, WebGLUniformLocation | null>;
}

/**
 * The Filter passes themselves, shared by the frame chain and the Layer
 * chain: one program per Filter, compiled on first use and kept, that
 * reads a source texture and writes the framebuffer bound by the caller
 * at the size given, with the Layer's mix and Parameters and the
 * instance's uniforms set, and a plain copy for presenting a result. One
 * that fails to compile is logged once and skipped, and `failure` tells
 * the compositor why, so every Layer using it is reported as an issue.
 */
export class FilterPrograms {
  readonly #gl: WebGL2RenderingContext;
  readonly #quad: WebGLBuffer;
  readonly #copy: WebGLProgram;
  readonly #copyFlip: WebGLUniformLocation;
  readonly #programs = new Map<string, ProgramEntry | undefined>();
  readonly #failures = new Map<string, string>();

  constructor(gl: WebGL2RenderingContext, quad: WebGLBuffer) {
    this.#gl = gl;
    this.#quad = quad;
    this.#copy = compileProgram(
      gl,
      FILTER_VERTEX_SOURCE,
      PRESENT_FRAGMENT_SOURCE,
    );
    gl.useProgram(this.#copy);
    gl.uniform1i(uniform(gl, this.#copy, "u_input"), 0);
    this.#copyFlip = uniform(gl, this.#copy, "u_flip");
  }

  /** Copies `source` into the bound framebuffer, whole, with blending off; `flip` turns its rows over. */
  copy(source: WebGLTexture, flip = false): void {
    const gl = this.#gl;
    gl.disable(gl.BLEND);
    gl.useProgram(this.#copy);
    gl.uniform1i(this.#copyFlip, flip ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    this.#drawQuad();
    gl.enable(gl.BLEND);
  }

  /**
   * Runs one pass from `source` into the bound framebuffer, whose viewport
   * is `width` by `height`, with blending off; the caller binds both and
   * restores its program afterwards. False when the Filter's program does
   * not compile, in which case nothing is drawn.
   */
  apply(
    pass: FilterPass,
    source: WebGLTexture,
    width: number,
    height: number,
  ): boolean {
    const entry = this.#program(pass);
    if (entry === undefined) return false;
    const gl = this.#gl;
    gl.disable(gl.BLEND);
    gl.useProgram(entry.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform2f(entry.resolution, width, height);
    gl.uniform2f(entry.texel, 1 / width, 1 / height);
    gl.uniform1f(entry.mix, pass.layer.mix);
    for (const [name, definition] of Object.entries(pass.filter.parameters))
      this.#setParameter(entry, name, definition, pass.params[name]);
    for (const [name, value] of Object.entries(pass.uniforms)) {
      const location = this.#location(entry, name);
      if (location !== null) setUniform(gl, location, value);
    }
    this.#drawQuad();
    gl.enable(gl.BLEND);
    return true;
  }

  #drawQuad(): void {
    const gl = this.#gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#quad);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  /** Why the Filter's program did not compile, once a pass has tried it. */
  failure(filterId: string): string | undefined {
    return this.#failures.get(filterId);
  }

  dispose(): void {
    const gl = this.#gl;
    for (const entry of this.#programs.values())
      if (entry !== undefined) gl.deleteProgram(entry.program);
    this.#programs.clear();
    this.#failures.clear();
    gl.deleteProgram(this.#copy);
  }

  #program(pass: FilterPass): ProgramEntry | undefined {
    const id = pass.filter.id;
    if (this.#programs.has(id)) return this.#programs.get(id);
    const gl = this.#gl;
    let entry: ProgramEntry | undefined;
    try {
      const program = compileProgram(
        gl,
        FILTER_VERTEX_SOURCE,
        filterFragmentSource(pass.filter),
      );
      gl.useProgram(program);
      gl.uniform1i(uniform(gl, program, "u_input"), 0);
      entry = {
        program,
        resolution: gl.getUniformLocation(program, "u_resolution"),
        texel: gl.getUniformLocation(program, "u_texel"),
        mix: uniform(gl, program, "u_mix"),
        locations: new Map(),
      };
    } catch (error: unknown) {
      console.error(`Filter “${id}” cannot run:`, error);
      this.#failures.set(id, errorMessage(error));
    }
    this.#programs.set(id, entry);
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
      case "media":
      case "text":
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
