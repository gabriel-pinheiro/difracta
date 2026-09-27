import { settings } from "@difracta/core";

import type { FontLoader } from "./font-loader.ts";
import { createScratchCanvas } from "./gl.ts";
import type { MediaHandle } from "./sdk/media.ts";
import type {
  TextBlock,
  TextBlockRequest,
  TextContext,
  TextHandle,
  TextRaster,
  TextRows,
  TextRowsRequest,
  TextStyle,
} from "./sdk/text.ts";
import type { TextMeasure } from "./sdk/text-layout.ts";

/** The size text is measured at; widths are divided by it into ems. */
const MEASURE_SIZE = 200;
/** The margin around text besides its outline, in ems: what a glyph may overhang its box by. */
const OVERHANG = 0.2;
/** A row's height, in ems: room for the tallest glyph and the lowest. */
const ROW_HEIGHT = 1.3;
const FILL = "#f00";
const OUTLINE = "#0f0";

type Context2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

/** Whether the canvas spaces letters itself; one that does not draws every text unspaced. */
function spaces(context: Context2D): boolean {
  return "letterSpacing" in context;
}

function applyStyle(
  context: Context2D,
  stack: string,
  size: number,
  letterSpacing: number,
): void {
  context.font = `${String(size)}px ${stack}`;
  if (spaces(context))
    context.letterSpacing = `${String(letterSpacing * size)}px`;
  context.textBaseline = "alphabetic";
  context.lineJoin = "round";
}

/** Where the baseline sits in a line box of `height` pixels, so the font's own box is centered in it. */
function baseline(context: Context2D, size: number, height: number): number {
  const metrics = context.measureText("M");
  const ascent =
    (metrics.fontBoundingBoxAscent as number | undefined) ?? size * 0.9;
  const descent =
    (metrics.fontBoundingBoxDescent as number | undefined) ?? size * 0.25;
  return (height - (ascent + descent)) / 2 + ascent;
}

/** How many columns lay `count` cells of this size out in the picture whose longer side is shortest. */
export function gridColumns(
  count: number,
  cellWidth: number,
  cellHeight: number,
): number {
  let best = 1;
  let shortest = Infinity;
  for (let columns = 1; columns <= count; columns += 1) {
    const longer = Math.max(
      columns * cellWidth,
      Math.ceil(count / columns) * cellHeight,
    );
    if (longer < shortest) {
      shortest = longer;
      best = columns;
    }
  }
  return best;
}

/**
 * The text pictures of one Output (`sdk/text.ts`): each distinct request
 * is rasterized once into a canvas of its own and shared by every
 * instance asking for it, fill coverage in red and outline coverage in
 * green over opaque black, which is uploaded like a Media picture. A
 * picture is kept while an instance holds it and forgotten the frame
 * none does; an instance still holding a forgotten one keeps drawing it.
 * A request too large for `settings.text.maxRasterSize` is drawn at the
 * largest size that fits, which its handle says.
 */
export class TextRasters implements TextContext {
  readonly #fonts: FontLoader;
  readonly #entries = new Map<string, TextHandle>();
  readonly #measures = new Map<string, TextMeasure>();
  #scratch: Context2D | undefined;
  #count = 0;

  constructor(fonts: FontLoader) {
    this.#fonts = fonts;
  }

  get version(): number {
    return this.#fonts.version;
  }

  /** How many pictures are kept, for tests. */
  get size(): number {
    return this.#entries.size;
  }

  measure(style: TextStyle): TextMeasure | undefined {
    const stack = this.#fonts.stack(style.font);
    if (stack === undefined) return undefined;
    // A font's further file changes widths, so the measure is per version.
    const key = JSON.stringify([stack, style.letterSpacing, this.version]);
    let measure = this.#measures.get(key);
    if (measure === undefined) {
      const widths = new Map<string, number>();
      measure = (text) => {
        let width = widths.get(text);
        if (width === undefined) {
          const context = this.#context();
          applyStyle(context, stack, MEASURE_SIZE, style.letterSpacing);
          width = context.measureText(text).width / MEASURE_SIZE;
          widths.set(text, width);
        }
        return width;
      };
      this.#measures.clear();
      this.#measures.set(key, measure);
    }
    return measure;
  }

  block(request: TextBlockRequest): TextBlock | undefined {
    const stack = this.#fonts.stack(request.font);
    if (stack === undefined || request.lines.length === 0) return undefined;
    const key = JSON.stringify(["block", this.version, request]);
    const cached = this.#entries.get(key);
    if (cached !== undefined) return cached;
    const measure = this.measure(request);
    if (measure === undefined) return undefined;
    const widths = request.lines.map(measure);
    const span = Math.max(...widths);
    const rows = request.lines.length * request.lineHeight;
    const margin = OVERHANG + request.outline;
    const size = this.#sizeWithin(
      request.size,
      span + margin * 2,
      rows + margin * 2,
    );
    const inset = Math.ceil(margin * size);
    const width = Math.max(1, Math.ceil(span * size)) + inset * 2;
    const lineHeight = request.lineHeight * size;
    const height = Math.max(1, Math.ceil(rows * size)) + inset * 2;
    const { canvas, context } = this.#canvas(width, height);
    applyStyle(context, stack, size, request.letterSpacing);
    const base = baseline(context, size, lineHeight);
    const content = width - inset * 2;
    this.#draw(context, request, size, (draw) => {
      request.lines.forEach((line, index) => {
        const lineWidth = (widths[index] ?? 0) * size;
        const x =
          request.align === "left"
            ? 0
            : request.align === "right"
              ? content - lineWidth
              : (content - lineWidth) / 2;
        draw(line, inset + x, inset + index * lineHeight + base);
      });
    });
    const handle: TextBlock = {
      id: this.#name(request.lines.join(" ")),
      image: canvas,
      width,
      height,
      version: 1,
      size,
      inset,
    };
    this.#entries.set(key, handle);
    return handle;
  }

  rows(request: TextRowsRequest): TextRows | undefined {
    const stack = this.#fonts.stack(request.font);
    if (stack === undefined || request.rows.length === 0) return undefined;
    const key = JSON.stringify(["rows", this.version, request]);
    const cached = this.#entries.get(key);
    if (cached !== undefined) return cached as TextRows;
    const measure = this.measure(request);
    if (measure === undefined) return undefined;
    const ems = request.rows.map(measure);
    const margin = OVERHANG + request.outline;
    const cell = {
      width: Math.max(...ems) + margin * 2,
      height: ROW_HEIGHT + margin * 2,
    };
    const columns = gridColumns(request.rows.length, cell.width, cell.height);
    const lines = Math.ceil(request.rows.length / columns);
    const size = this.#sizeWithin(
      request.size,
      columns * cell.width,
      lines * cell.height,
    );
    const inset = Math.ceil(margin * size);
    const widths = ems.map((width) => width * size);
    const cellWidth = Math.max(1, Math.ceil(Math.max(...widths))) + inset * 2;
    const rowHeight = Math.ceil(ROW_HEIGHT * size) + inset * 2;
    const { canvas, context } = this.#canvas(
      cellWidth * columns,
      rowHeight * lines,
    );
    applyStyle(context, stack, size, request.letterSpacing);
    const base = baseline(context, size, rowHeight);
    this.#draw(context, request, size, (draw) => {
      request.rows.forEach((row, index) => {
        draw(
          row,
          (index % columns) * cellWidth +
            (cellWidth - (widths[index] ?? 0)) / 2,
          Math.floor(index / columns) * rowHeight + base,
        );
      });
    });
    const handle: TextRows = {
      id: this.#name(request.rows.join(" ")),
      image: canvas,
      width: cellWidth * columns,
      height: rowHeight * lines,
      version: 1,
      size,
      inset,
      columns,
      cellWidth,
      rowHeight,
      widths,
    };
    this.#entries.set(key, handle);
    return handle;
  }

  /** Forgets every picture not in `live`. */
  retain(live: ReadonlySet<MediaHandle>): void {
    for (const [key, handle] of this.#entries)
      if (!live.has(handle)) this.#entries.delete(key);
  }

  /** `size`, or the largest below it at which a picture of these ems fits a texture. */
  #sizeWithin(size: number, width: number, height: number): number {
    const limit = settings.text.maxRasterSize;
    return Math.max(
      1,
      Math.floor(Math.min(size, limit / width, limit / height)),
    );
  }

  /** The outline first, then the fill, each adding to its own channel. */
  #draw(
    context: Context2D,
    request: TextRaster,
    size: number,
    each: (draw: (text: string, x: number, y: number) => void) => void,
  ): void {
    context.globalCompositeOperation = "lighter";
    if (request.outline > 0) {
      context.strokeStyle = OUTLINE;
      context.lineWidth = request.outline * size * 2;
      each((text, x, y) => {
        context.strokeText(text, x, y);
      });
    }
    context.fillStyle = FILL;
    each((text, x, y) => {
      context.fillText(text, x, y);
    });
  }

  #canvas(width: number, height: number) {
    const scratch = createScratchCanvas(width, height);
    scratch.context.fillStyle = "#000";
    scratch.context.fillRect(0, 0, width, height);
    return scratch;
  }

  #context(): Context2D {
    this.#scratch ??= createScratchCanvas(1, 1).context;
    return this.#scratch;
  }

  #name(text: string): string {
    this.#count += 1;
    return `text ${String(this.#count)} “${text.slice(0, 40)}”`;
  }
}
