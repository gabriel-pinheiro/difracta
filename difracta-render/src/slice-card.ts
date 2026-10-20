import { settings } from "@difracta/core";

import { createScratchCanvas, createTexture } from "./gl.ts";
import type { SliceTile } from "./plan-calibration.ts";
import { paintSliceCard } from "./slice-card-paint.ts";
import { MODE, type SurfaceProgram } from "./surface-program.ts";

/** The largest side a card's texture is painted at; a bigger tile samples it up. */
const MAX_SIDE = 4096;

interface Card {
  readonly key: string;
  readonly texture: WebGLTexture;
}

/**
 * The Slice test card: each Slice's placed rectangle painted as an LED test
 * pattern (`slice-card-paint.ts`), the selected Slice at full brightness.
 * Drawn in the Projection Frame through the program set to the full frame,
 * so the slice pass then puts every card on its panel: a panel showing
 * another's name, or its name turned, is placed or turned wrong. Each card
 * is painted once into a texture and painted again only when what it shows
 * or its size in pixels changes.
 */
export class SliceCardDrawing {
  readonly #program: SurfaceProgram;
  readonly #cards = new Map<string, Card>();
  #scratch: ReturnType<typeof createScratchCanvas> | undefined;

  constructor(program: SurfaceProgram) {
    this.#program = program;
  }

  /** Draws every tile; the program is current and set to the full frame of `width` by `height` pixels. */
  draw(tiles: readonly SliceTile[], width: number, height: number): void {
    const { gl, uniforms } = this.#program;
    gl.uniform1i(uniforms.maskEnabled, 0);
    gl.uniform1i(uniforms.edge, 0);
    gl.uniform1i(uniforms.mode, MODE.label);
    gl.uniform4f(uniforms.color, 1, 1, 1, 1);
    gl.activeTexture(gl.TEXTURE1);
    const drawn = new Set<string>();
    for (const tile of tiles) {
      const { x, y, width: w, height: h } = tile.rect;
      const card = this.#card(tile, w * width, h * height);
      drawn.add(tile.slice.id);
      gl.bindTexture(gl.TEXTURE_2D, card.texture);
      gl.uniform4f(uniforms.rect, x, y, w, h);
      this.#program.drawQuad();
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
    for (const [id, card] of this.#cards)
      if (!drawn.has(id)) {
        gl.deleteTexture(card.texture);
        this.#cards.delete(id);
      }
  }

  dispose(): void {
    for (const card of this.#cards.values())
      this.#program.gl.deleteTexture(card.texture);
    this.#cards.clear();
  }

  /** The tile's card texture at about `pixelWidth` × `pixelHeight`, painted when stale. */
  #card(tile: SliceTile, pixelWidth: number, pixelHeight: number): Card {
    const fit = Math.min(1, MAX_SIDE / pixelWidth, MAX_SIDE / pixelHeight);
    const width = Math.max(1, Math.round(pixelWidth * fit));
    const height = Math.max(1, Math.round(pixelHeight * fit));
    const { slice } = tile;
    const cell = settings.slices.testCardCell;
    const key = JSON.stringify([
      width,
      height,
      slice.name,
      slice.rect,
      slice.rotation,
      tile.index,
      tile.selected,
      cell,
    ]);
    const cached = this.#cards.get(slice.id);
    if (cached?.key === key) return cached;
    const gl = this.#program.gl;
    if (cached !== undefined) gl.deleteTexture(cached.texture);
    this.#scratch ??= createScratchCanvas(1, 1);
    const { canvas, context } = this.#scratch;
    canvas.width = width;
    canvas.height = height;
    paintSliceCard(context, width, height, {
      slice,
      index: tile.index,
      selected: tile.selected,
      cell,
    });
    const texture = createTexture(gl);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    const card = { key, texture };
    this.#cards.set(slice.id, card);
    return card;
  }
}
