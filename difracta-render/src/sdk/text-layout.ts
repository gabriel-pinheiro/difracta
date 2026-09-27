/**
 * Where text breaks and how large it is drawn: the pure half of text, over
 * a measure that says how wide a run of characters is. Widths and sizes
 * are in ems, a size of one, so one measure serves every size.
 */
export type TextMeasure = (text: string) => number;

export const TEXT_FITS = ["fit", "width", "fixed"] as const;
export type TextFit = (typeof TEXT_FITS)[number];

export interface TextLayoutRequest {
  readonly text: string;
  /** The box the text is laid out in, in pixels. */
  readonly width: number;
  readonly height: number;
  readonly fit: TextFit;
  /** The size of one em in pixels that `fixed` draws at. */
  readonly fixedSize: number;
  /** The distance between two baselines, in ems. */
  readonly lineHeight: number;
  readonly measure: TextMeasure;
}

export interface TextLayout {
  readonly lines: readonly string[];
  /** The size of one em, in pixels. */
  readonly size: number;
  /** The block's size in pixels: its widest line, and its lines at the line height. */
  readonly width: number;
  readonly height: number;
}

/** How many halvings `fit` spends on finding its size: past a thousandth of the range nothing moves a pixel. */
const FIT_STEPS = 12;

const graphemes = (text: string): string[] => Array.from(text);

/** The lines an author typed; a text ending in a line break has no empty last line. */
export function paragraphs(text: string): string[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  while (lines.length > 1 && lines.at(-1)?.trim() === "") lines.pop();
  return lines.map((line) => line.trim().replace(/\s+/g, " "));
}

/** The widest word of the text, in ems. */
export function widestWord(text: string, measure: TextMeasure): number {
  let widest = 0;
  for (const line of paragraphs(text))
    for (const word of line.split(" "))
      if (word !== "") widest = Math.max(widest, measure(word));
  return widest;
}

/** A word wider than the line, cut into the longest pieces that fit, one character at least. */
function breakWord(
  word: string,
  maxWidth: number,
  measure: TextMeasure,
): string[] {
  const pieces: string[] = [];
  let piece = "";
  for (const character of graphemes(word)) {
    if (piece !== "" && measure(piece + character) > maxWidth) {
      pieces.push(piece);
      piece = character;
    } else piece += character;
  }
  if (piece !== "") pieces.push(piece);
  return pieces;
}

/**
 * The text broken into lines no wider than `maxWidth` ems: at the line
 * breaks it has, then between words, as many on a line as fit, and inside
 * a word only when the word alone is wider than a line. An empty line
 * stays, since an author spaces paragraphs with it.
 */
export function breakLines(
  text: string,
  maxWidth: number,
  measure: TextMeasure,
): string[] {
  const lines: string[] = [];
  for (const paragraph of paragraphs(text)) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      if (word === "") continue;
      const pieces =
        measure(word) > maxWidth ? breakWord(word, maxWidth, measure) : [word];
      for (const piece of pieces) {
        const joined = line === "" ? piece : `${line} ${piece}`;
        if (line !== "" && measure(joined) > maxWidth) {
          lines.push(line);
          line = piece;
        } else line = joined;
      }
    }
    lines.push(line);
  }
  return lines;
}

/**
 * The text in as many lines as `breakLines` gives it at `maxWidth`, broken
 * at the narrowest width that still gives that many, so the lines come
 * out about as long as each other and the last is not a lone word.
 */
export function balanceLines(
  text: string,
  maxWidth: number,
  measure: TextMeasure,
): string[] {
  let lines = breakLines(text, maxWidth, measure);
  if (lines.length < 2) return lines;
  let low = widestWord(text, measure);
  let high = maxWidth;
  for (let step = 0; step < FIT_STEPS && low < high; step += 1) {
    const middle = (low + high) / 2;
    const narrower = breakLines(text, middle, measure);
    if (narrower.length > lines.length) low = middle;
    else {
      high = middle;
      lines = narrower;
    }
  }
  return lines;
}

function widest(lines: readonly string[], measure: TextMeasure): number {
  return lines.reduce((width, line) => Math.max(width, measure(line)), 0);
}

/**
 * The text laid out in a box. `fixed` draws at the size given and wraps at
 * the box's width. `width` keeps the lines as typed and sizes them so the
 * widest spans the box. `fit` wraps and takes the largest size at which
 * the block still fits the box both ways, never breaking inside a word,
 * with its lines balanced.
 * Undefined when there is nothing to lay out: no text, or no box.
 */
export function layoutText(request: TextLayoutRequest): TextLayout | undefined {
  const { text, width, height, fit, lineHeight, measure } = request;
  if (text.trim() === "" || width <= 0 || height <= 0) return undefined;
  const block = (lines: readonly string[], size: number): TextLayout => ({
    lines,
    size,
    width: widest(lines, measure) * size,
    height: lines.length * lineHeight * size,
  });
  if (fit === "fixed") {
    const size = request.fixedSize;
    if (size <= 0) return undefined;
    return block(breakLines(text, width / size, measure), size);
  }
  if (fit === "width") {
    const lines = paragraphs(text);
    const span = widest(lines, measure);
    return span <= 0 ? undefined : block(lines, width / span);
  }
  const word = widestWord(text, measure);
  if (word <= 0) return undefined;
  const fits = (size: number): boolean =>
    breakLines(text, width / size, measure).length * lineHeight * size <=
    height;
  // One line as tall as the box, or the widest word as wide as it, is the most it can be.
  let high = Math.min(height / lineHeight, width / word);
  if (!fits(high)) {
    let low = 0;
    for (let step = 0; step < FIT_STEPS; step += 1) {
      const middle = (low + high) / 2;
      if (fits(middle)) low = middle;
      else high = middle;
    }
    high = low;
  }
  if (high <= 0) return undefined;
  return block(balanceLines(text, width / high, measure), high);
}

/**
 * The size a text of `size` pixels per em is rasterized at: the next of a
 * ladder of sizes a quarter octave apart, so a size swept live draws the
 * text again a few times along the way and not on every frame, and the
 * picture is never stretched, only shrunk by less than a fifth.
 */
export function rasterSize(size: number): number {
  if (!(size > 0)) return 0;
  return Math.ceil(2 ** (Math.ceil(Math.log2(size) * 4 - 1e-9) / 4));
}
