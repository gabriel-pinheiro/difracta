import type { RootFilterPass } from "./filter-players.ts";
import type { FilterPrograms } from "./filter-programs.ts";
import {
  deleteShaderBuffer,
  fitShaderBuffer,
  type ShaderBuffer,
} from "./shader-buffers.ts";

/**
 * The frame targets a filtered frame goes through: two frame-sized RGBA
 * textures. Layers accumulate into the active one; each pass reads it and
 * writes the other, then the roles swap; `present` copies the active one
 * to the screen. Two suffice for any number of root Filters, and they
 * exist only once a frame has needed them. The passes themselves are the
 * shared `FilterPrograms`, which the Layer chain runs too.
 */
export class FilterChain {
  readonly #gl: WebGL2RenderingContext;
  readonly #programs: FilterPrograms;
  #targets: [ShaderBuffer | undefined, ShaderBuffer | undefined] = [
    undefined,
    undefined,
  ];
  #width = 0;
  #height = 0;
  #active: 0 | 1 = 0;

  constructor(gl: WebGL2RenderingContext, programs: FilterPrograms) {
    this.#gl = gl;
    this.#programs = programs;
  }

  /** Starts a filtered frame: the active target is cleared and bound for the Layers. */
  begin(width: number, height: number): void {
    const gl = this.#gl;
    const size = { width, height };
    this.#targets = [
      fitShaderBuffer(gl, this.#targets[0], size),
      fitShaderBuffer(gl, this.#targets[1], size),
    ];
    this.#width = width;
    this.#height = height;
    this.#active = 0;
    this.resume();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /** Binds the active target again, with its viewport, after another target was drawn into. */
  resume(): void {
    const target = this.#targets[this.#active];
    if (target === undefined) return;
    const gl = this.#gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, this.#width, this.#height);
  }

  /** Runs one pass from the active target into the other, which becomes active and stays bound. */
  apply(pass: RootFilterPass): void {
    const source = this.#targets[this.#active];
    const destination = this.#targets[this.#active === 0 ? 1 : 0];
    if (source === undefined || destination === undefined) return;
    const gl = this.#gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, destination.framebuffer);
    if (this.#programs.apply(pass, source.texture, this.#width, this.#height))
      this.#active = this.#active === 0 ? 1 : 0;
    this.resume();
  }

  /** Copies the active target to the screen and ends the filtered frame. */
  present(): void {
    const target = this.#targets[this.#active];
    if (target === undefined) return;
    const gl = this.#gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.#width, this.#height);
    this.#programs.copy(target.texture);
  }

  dispose(): void {
    const gl = this.#gl;
    for (const target of this.#targets)
      if (target !== undefined) deleteShaderBuffer(gl, target);
    this.#targets = [undefined, undefined];
  }
}
