import { cssColor, defineVisual, fit, type Random } from "@difracta/render/sdk";

const KATAKANA = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホ";
const DIGITS = "0123456789";
const LATIN = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function charsetFor(choice: string): string {
  if (choice === "digits") return DIGITS;
  if (choice === "latin") return LATIN;
  if (choice === "katakana-digits") return KATAKANA + DIGITS;
  return KATAKANA;
}

/** A stable 0-to-1 value for a cell, so its glyph and its churn phase hold still. */
function hashCell(column: number, row: number, step: number): number {
  let hash =
    Math.imul(column + 1, 374761393) ^
    Math.imul(row + 1, 668265263) ^
    Math.imul(step + 1, 2246822519);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

interface Column {
  /** Rows per second at Fall Speed 1. */
  readonly rate: number;
  /** Rows fallen, wrapped to the span the column repeats over. */
  head: number;
  /** Seconds of fall time, which is what makes the glyphs mutate. */
  churn: number;
}

function makeColumn(random: Random, span: number): Column {
  return {
    rate: 4 + random() * 8,
    head: random() * span,
    churn: random() * 90,
  };
}

/** How many glyph cells fit, and how far a head travels before starting over. */
function layout(width: number, height: number, cell: number, trail: number) {
  const columns = Math.max(1, Math.floor(width / cell));
  const rows = Math.ceil(height / cell) + 1;
  return { columns, rows, span: rows + trail };
}

export const glyphRain = defineVisual({
  id: "glyph-rain",
  name: "Glyph Rain",
  description:
    "Columns of katakana, digits or Latin glyphs fall in fading trails, each glyph mutating in place, fastest at the bright head.",
  notes:
    "The screen-of-code look, and one of the few Visuals that reads as text from the front row. It draws on transparency, so put it over black or over a dark Visual, and Additive blend mode gives the heads their bloom. Glyph Size is the cell in Layer pixels and sets everything else: the column count is the Target's width divided by it, so 12 px is a dense wall of small type and 40 px a handful of big columns. Trail Length is how many glyphs fade out behind each head, counted in cells, so a long trail on a short Target wraps around. Head Color is the leading glyph and Trail Color everything behind it; setting them the same kills the comet look. Charset picks the alphabet. Fall Speed scales both the descent and the rate glyphs mutate, so 0 freezes a still page of text and it can be swept live without columns jumping. Cost is one text draw per lit cell, so a small Glyph Size with a long Trail Length is the expensive corner.",
  parameters: {
    color: {
      kind: "color",
      label: "Trail Color",
      default: [0.235, 1, 0.51, 1],
    },
    head: { kind: "color", label: "Head Color", default: [0.863, 1, 0.922, 1] },
    charset: {
      kind: "choice",
      label: "Charset",
      default: "katakana",
      options: [
        { value: "katakana", label: "Katakana" },
        { value: "digits", label: "Digits" },
        { value: "latin", label: "Latin" },
        { value: "katakana-digits", label: "Katakana + Digits" },
      ],
    },
    size: {
      kind: "number",
      label: "Glyph Size",
      default: 18,
      min: 8,
      max: 48,
      step: 1,
      unit: "px",
      description: "The glyph cell; the column count is the width over it.",
    },
    trail: {
      kind: "number",
      label: "Trail Length",
      default: 14,
      min: 3,
      max: 40,
      step: 1,
    },
    speed: {
      kind: "number",
      label: "Fall Speed",
      default: 1,
      min: 0,
      max: 3,
      step: 0.05,
      unit: "x",
    },
  },
  create({ random, params, width, height }) {
    const all: Column[] = [];
    const first = layout(width, height, params.size, Math.round(params.trail));
    fit(all, first.columns, () => makeColumn(random, first.span));
    return {
      update({ dt, params, width, height, changed }) {
        const { columns, span } = layout(
          width,
          height,
          params.size,
          Math.round(params.trail),
        );
        fit(all, columns, () => makeColumn(random, span));
        const step = dt * params.speed;
        for (const column of all) {
          column.head += step * column.rate;
          column.head -= Math.floor(column.head / span) * span;
          column.churn += step;
        }
        return {
          changed: changed || params.speed > 0,
          blank: params.color[3] <= 0 && params.head[3] <= 0,
        };
      },
      render({ context, width, height, params }) {
        const cell = params.size;
        const trail = Math.round(params.trail);
        const { columns, rows } = layout(width, height, cell, trail);
        const glyphs = charsetFor(params.charset);

        context.font = `${String(cell)}px monospace`;
        context.textAlign = "center";
        context.textBaseline = "middle";

        for (let index = 0; index < columns; index += 1) {
          const column = all[index];
          if (column === undefined) continue;
          const x = (index + 0.5) * cell;
          for (let offset = 0; offset < trail; offset += 1) {
            const row = Math.floor(column.head) - offset;
            if (row < 0 || row >= rows) continue;
            // Glyphs mutate a few times a second, faster at the head.
            const step = Math.floor(
              column.churn * (offset === 0 ? 12 : 3) +
                hashCell(index, row, 0) * 90,
            );
            const pick = Math.floor(hashCell(index, row, step) * glyphs.length);
            const fade = 1 - offset / trail;
            context.fillStyle =
              offset === 0
                ? cssColor(params.head)
                : cssColor(params.color, Math.pow(fade, 1.4) * params.color[3]);
            context.fillText(glyphs.charAt(pick), x, (row + 0.5) * cell);
          }
        }
      },
    };
  },
});
