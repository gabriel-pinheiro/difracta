import { surfaceCanvasSize } from "@difracta/core";

import type { NestedChain } from "./filter-players.ts";
import type { FilterPrograms } from "./filter-programs.ts";
import type { LayerFrame } from "./layer-players.ts";
import type { LayerDraw } from "./plan.ts";
import {
  deleteShaderBuffer,
  fitShaderBuffer,
  type ShaderBuffer,
} from "./shader-buffers.ts";
import type { ShaderVisualPrograms } from "./shader-visuals.ts";

export interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * The size of a Visual Layer's Target on this Output at full resolution,
 * which is what its Filters run at, whatever the Visual renders at: the
 * canvas size at Render Scale 1, capped like any Layer canvas.
 */
export function targetBufferSize(
  draw: LayerDraw,
  outputWidth: number,
  outputHeight: number,
  maxDimension: number,
): Size {
  return surfaceCanvasSize({
    corners: draw.corners,
    outputWidth,
    outputHeight,
    size: draw.size,
    renderScale: 1,
    maxDimension,
  });
}

interface Entry {
  result: ShaderBuffer | undefined;
}

/** What a Layer's chain hands back: the texture to composite, rows bottom first, and the passes run for it this frame. */
export interface ChainResult {
  readonly texture: WebGLTexture;
  readonly executed: number;
}

/**
 * A Visual Layer's Filters run over its picture in its Target's space: a
 * buffer the Target's size on this Output holds the result, and the
 * passes alternate between it and a scratch buffer of the same size that
 * every filtered Layer of that size shares, since Layers run one after
 * another. The chain holds the picture the way the frame chain does, rows
 * bottom first, so a Filter's top is the top on the wall whichever chain
 * runs it: the Layer's canvas texture or shader buffer, rows top first, is
 * copied in turned over (and scaled up when below full resolution), a
 * shader Visual at full resolution is rendered in bottom first, into
 * whichever of the two buffers lets the last pass land in the result, and
 * the result is composited turned back. The chain runs only when the
 * picture is new, a pass would change, or the size changed; otherwise the
 * kept result is composited again. A Layer with no pass to run never
 * comes here and keeps its plain path.
 */
export class LayerChain {
  readonly #gl: WebGL2RenderingContext;
  readonly #programs: FilterPrograms;
  readonly #shaders: ShaderVisualPrograms;
  readonly #entries = new Map<string, Entry>();
  readonly #scratch = new Map<string, ShaderBuffer>();
  readonly #used = new Set<string>();

  constructor(
    gl: WebGL2RenderingContext,
    programs: FilterPrograms,
    shaders: ShaderVisualPrograms,
  ) {
    this.#gl = gl;
    this.#programs = programs;
    this.#shaders = shaders;
  }

  /**
   * The Layer's filtered picture, run anew when `fresh` (the Visual drew
   * something new) or the chain says it changed, and otherwise as kept.
   * Leaves another framebuffer and program bound; the caller restores its
   * own.
   */
  run(
    frame: LayerFrame,
    chain: NestedChain,
    size: Size,
    fresh: boolean,
  ): ChainResult {
    const gl = this.#gl;
    const id = frame.draw.layer.id;
    const entry = this.#entries.get(id) ?? { result: undefined };
    this.#entries.set(id, entry);
    const kept = entry.result;
    entry.result = fitShaderBuffer(gl, kept, size);
    const result = entry.result;
    if (!fresh && !chain.changed && entry.result === kept)
      return { texture: result.texture, executed: 0 };
    const scratch = this.#scratchFor(size);
    // The picture starts in the buffer the passes will not end in.
    const into = chain.passes.length % 2 === 1 ? scratch : result;
    gl.bindFramebuffer(gl.FRAMEBUFFER, into.framebuffer);
    gl.viewport(0, 0, size.width, size.height);
    if (frame.kind === "canvas") this.#programs.copy(frame.texture, true);
    else if (frame.buffer !== undefined)
      this.#programs.copy(frame.buffer.texture, true);
    else
      this.#shaders.render(
        into,
        {
          visual: frame.visual,
          params: frame.params,
          uniforms: frame.uniforms,
          textures: frame.textures,
          paths: frame.draw.paths,
        },
        "bottom-first",
      );
    let source = into.texture;
    let executed = 0;
    for (const pass of chain.passes) {
      const destination = source === result.texture ? scratch : result;
      gl.bindFramebuffer(gl.FRAMEBUFFER, destination.framebuffer);
      gl.viewport(0, 0, size.width, size.height);
      if (this.#programs.apply(pass, source, size.width, size.height)) {
        source = destination.texture;
        executed += 1;
      }
    }
    if (source !== result.texture) {
      // A pass that could not run broke the alternation: the picture is
      // copied into the result so it is kept.
      gl.bindFramebuffer(gl.FRAMEBUFFER, result.framebuffer);
      gl.viewport(0, 0, size.width, size.height);
      this.#programs.copy(source);
    }
    return { texture: result.texture, executed };
  }

  /**
   * Keeps the results of the Layers given, a hidden Layer's included, and
   * the scratch sizes used since the last call; drops the rest.
   */
  retain(filtered: ReadonlySet<string>): void {
    const gl = this.#gl;
    for (const [id, entry] of this.#entries) {
      if (filtered.has(id)) continue;
      if (entry.result !== undefined) deleteShaderBuffer(gl, entry.result);
      this.#entries.delete(id);
    }
    for (const [key, buffer] of this.#scratch) {
      if (this.#used.has(key)) continue;
      deleteShaderBuffer(gl, buffer);
      this.#scratch.delete(key);
    }
    this.#used.clear();
  }

  dispose(): void {
    const gl = this.#gl;
    for (const entry of this.#entries.values())
      if (entry.result !== undefined) deleteShaderBuffer(gl, entry.result);
    this.#entries.clear();
    for (const buffer of this.#scratch.values()) deleteShaderBuffer(gl, buffer);
    this.#scratch.clear();
    this.#used.clear();
  }

  #scratchFor(size: Size): ShaderBuffer {
    const key = `${size.width}x${size.height}`;
    this.#used.add(key);
    const current = this.#scratch.get(key);
    if (current !== undefined) return current;
    const buffer = fitShaderBuffer(this.#gl, undefined, size);
    this.#scratch.set(key, buffer);
    return buffer;
  }
}
