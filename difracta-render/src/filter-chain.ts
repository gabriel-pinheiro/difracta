import type { ParameterDefinition } from "@difracta/core";

import type { FilterPass } from "./filter-players.ts";
import {
  FILTER_VERTEX_SOURCE,
  filterFragmentSource,
  PRESENT_FRAGMENT_SOURCE,
  uniformName,
} from "./filter-shaders.ts";
import { compileProgram, createTexture, setUniform, uniform } from "./gl.ts";
import { errorMessage } from "./issues.ts";

interface Target {
  readonly framebuffer: WebGLFramebuffer;
  readonly texture: WebGLTexture;
}

interface ProgramEntry {
  readonly program: WebGLProgram;
  readonly resolution: WebGLUniformLocation | null;
  readonly texel: WebGLUniformLocation | null;
  readonly mix: WebGLUniformLocation;
  readonly locations: Map<string, WebGLUniformLocation | null>;
}

/**
 * The frame targets a filtered frame goes through: two frame-sized RGBA
 * textures. Layers accumulate into the active one; each pass reads it and
 * writes the other, then the roles swap; `present` copies the active one
 * to the screen. Two suffice for any number of Filters, and they exist
 * only once a frame has needed them. Programs are compiled once per
 * Filter and kept; one that fails to compile is logged once and skipped,
 * and `failure` tells the compositor why, so every Layer using it is
 * reported as an issue.
 */
export class FilterChain {
  readonly #gl: WebGL2RenderingContext;
  readonly #quad: WebGLBuffer;
  readonly #present: WebGLProgram;
  readonly #programs = new Map<string, ProgramEntry | undefined>();
  readonly #failures = new Map<string, string>();
  #targets: readonly [Target, Target] | undefined;
  #width = 0;
  #height = 0;
  #active: 0 | 1 = 0;

  constructor(gl: WebGL2RenderingContext, quad: WebGLBuffer) {
    this.#gl = gl;
    this.#quad = quad;
    this.#present = compileProgram(
      gl,
      FILTER_VERTEX_SOURCE,
      PRESENT_FRAGMENT_SOURCE,
    );
    gl.useProgram(this.#present);
    gl.uniform1i(uniform(gl, this.#present, "u_input"), 0);
  }

  /** Starts a filtered frame: the active target is cleared and bound for the Layers. */
  begin(width: number, height: number): void {
    const gl = this.#gl;
    const targets = this.#targets ?? [this.#target(), this.#target()];
    this.#targets = targets;
    if (this.#width !== width || this.#height !== height) {
      for (const target of targets) {
        gl.bindTexture(gl.TEXTURE_2D, target.texture);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          width,
          height,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          null,
        );
      }
      this.#width = width;
      this.#height = height;
    }
    this.#active = 0;
    gl.bindFramebuffer(gl.FRAMEBUFFER, targets[0].framebuffer);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /** Runs one pass from the active target into the other, which becomes active and stays bound. */
  apply(pass: FilterPass): void {
    const targets = this.#targets;
    if (targets === undefined) return;
    const entry = this.#program(pass);
    if (entry === undefined) return;
    const gl = this.#gl;
    const source = targets[this.#active];
    const destination = targets[this.#active === 0 ? 1 : 0];
    gl.bindFramebuffer(gl.FRAMEBUFFER, destination.framebuffer);
    gl.disable(gl.BLEND);
    gl.useProgram(entry.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source.texture);
    gl.uniform2f(entry.resolution, this.#width, this.#height);
    gl.uniform2f(entry.texel, 1 / this.#width, 1 / this.#height);
    gl.uniform1f(entry.mix, pass.draw.layer.mix);
    for (const [name, definition] of Object.entries(pass.filter.parameters))
      this.#setParameter(entry, name, definition, pass.params[name]);
    for (const [name, value] of Object.entries(pass.uniforms)) {
      const location = this.#location(entry, name);
      if (location !== null) setUniform(gl, location, value);
    }
    this.#drawQuad();
    gl.enable(gl.BLEND);
    this.#active = this.#active === 0 ? 1 : 0;
  }

  /** Copies the active target to the screen and ends the filtered frame. */
  present(): void {
    const targets = this.#targets;
    if (targets === undefined) return;
    const gl = this.#gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.BLEND);
    gl.useProgram(this.#present);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, targets[this.#active].texture);
    this.#drawQuad();
    gl.enable(gl.BLEND);
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
    gl.deleteProgram(this.#present);
    for (const target of this.#targets ?? []) {
      gl.deleteFramebuffer(target.framebuffer);
      gl.deleteTexture(target.texture);
    }
    this.#targets = undefined;
  }

  #target(): Target {
    const gl = this.#gl;
    const texture = createTexture(gl);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { framebuffer, texture };
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

  #drawQuad(): void {
    const gl = this.#gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#quad);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}
