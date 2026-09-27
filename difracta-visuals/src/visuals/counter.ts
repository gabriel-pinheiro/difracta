import {
  defineShaderVisual,
  rasterSize,
  type TextRows,
} from "@difracta/render/sdk";

import {
  clampCount,
  columnAt,
  columnMoving,
  columnPlace,
  digitsOf,
  moveCount,
  sendColumn,
  settleColumn,
  stepColumn,
  type Column,
} from "./counter-count.ts";
import {
  COUNTER_FRAGMENT,
  MAX_DIGITS,
  MAX_PIECES,
  PREFIX_CELL,
  SIGN_CELL,
  SUFFIX_CELL,
} from "./counter-fragment.ts";
import {
  TEXT_COLOR_PARAMETERS,
  TEXT_FIT_PARAMETERS,
  TEXT_MARGIN_PARAMETER,
  shownOutline,
  textBox,
} from "./text-style.ts";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
/** What Start, Minimum and Maximum go from and to: a range a slider sets to the unit. */
const COUNT_RANGE = { min: -50, max: 100, step: 1 } as const;
/** How much larger or smaller the count gets at the start of a Pop. */
const POP = 0.3;

export const counter = defineShaderVisual({
  id: "counter",
  name: "Counter",
  description:
    "A number that Cues count up, down and back to its start, each digit rolling, flipping or popping to the next.",
  notes:
    "A score, a lap count, a number of anything. Increment and Decrement move the count by Step, Reset returns it to Start; fire them from Macros, so a button or an OSC message counts. The count lives in the Layer's instance: it starts at Start whenever the Scene plays and is not saved, and changing Start moves nothing until the next Reset, so touching a Parameter never wipes a score. Start, Minimum and Maximum go from -50 to 100. Minimum and Maximum hold the count, and At Limit says what a step past them does: Stop stays there, Wrap carries on from the other end, which makes a 0 to 9 counter turn over. Animation is how a digit becomes the next: Cut at once, Roll like an odometer, up when the count rose and down when it fell, Flip through a fold, Pop with a punch of the whole number, larger on the way up and smaller on the way down. Each digit eases to its target over Animation Time, and Cues that arrive faster than that are all counted: the digits spin through and settle on the right number. Every digit has a cell as wide as the font's widest, so the number does not shiver as it counts, in any font; DSEG7 Classic gives the scoreboard look. The number is sized to the digits it has, so with Fit or Fill Width it shrinks when it gains one: set Minimum Digits to the longest count expected, which also gives the leading zeros of 007. Prefix and Suffix are drawn with it, spaces included, for “$” or “ pts”. It draws on transparency; give it an Outline Width over a busy Visual. The digits are drawn once per Font, Outline Width and size, as large as they show, and counting only moves them, so the cost is one shader pass on the frames a digit moves and nothing while it rests.",
  cues: [
    { key: "increment", label: "Increment", description: "Adds Step." },
    { key: "decrement", label: "Decrement", description: "Subtracts Step." },
    { key: "reset", label: "Reset", description: "Returns to Start." },
  ],
  parameters: {
    start: {
      kind: "number",
      label: "Start",
      default: 0,
      ...COUNT_RANGE,
      description: "Where the count begins and what Reset returns it to.",
    },
    step: {
      kind: "number",
      label: "Step",
      default: 1,
      min: 1,
      max: 10,
      step: 1,
    },
    min: {
      kind: "number",
      label: "Minimum",
      default: 0,
      ...COUNT_RANGE,
    },
    max: {
      kind: "number",
      label: "Maximum",
      default: 100,
      ...COUNT_RANGE,
    },
    atLimit: {
      kind: "choice",
      label: "At Limit",
      default: "stop",
      options: [
        { value: "stop", label: "Stop" },
        { value: "wrap", label: "Wrap" },
      ],
    },
    digits: {
      kind: "number",
      label: "Minimum Digits",
      default: 1,
      min: 1,
      max: MAX_DIGITS,
      step: 1,
      description: "Shorter counts get leading zeros up to this many digits.",
    },
    prefix: { kind: "text", label: "Prefix", default: "" },
    suffix: { kind: "text", label: "Suffix", default: "" },
    animation: {
      kind: "choice",
      label: "Animation",
      default: "roll",
      options: [
        { value: "cut", label: "Cut" },
        { value: "roll", label: "Roll" },
        { value: "flip", label: "Flip" },
        { value: "pop", label: "Pop" },
      ],
    },
    time: {
      kind: "number",
      label: "Animation Time",
      default: 0.3,
      min: 0.05,
      max: 2,
      step: 0.05,
      unit: "s",
    },
    ...TEXT_FIT_PARAMETERS,
    ...TEXT_COLOR_PARAMETERS,
    margin: TEXT_MARGIN_PARAMETER,
  },
  fragment: COUNTER_FRAGMENT,
  create({ text, params: first }) {
    let params = first;
    let count = clampCount(first.start, limitsOf(first));
    let columns: Column[] = digitsOf(count, first.digits, MAX_DIGITS).map(
      columnAt,
    );
    /** 1 at the start of a Pop, 0 once it is over; its sign is the way the count went. */
    let pop = 0;
    let popDirection = 1;
    let moved = true;
    let glyphs: TextRows | undefined;
    let fonts = -1;
    let width = 0;
    let height = 0;

    /** The count changed: every column is sent to its digit, new columns appear on theirs. */
    function show(next: number): void {
      if (next === count) return;
      const size = Math.abs(next) - Math.abs(count);
      const direction = size !== 0 ? size : next - count;
      popDirection = next > count ? 1 : -1;
      count = next;
      const digits = digitsOf(count, params.digits, MAX_DIGITS);
      columns = digits.map((digit, index) => {
        const column = columns[index];
        if (column === undefined) return columnAt(digit);
        sendColumn(column, digit, direction);
        return column;
      });
      if (params.animation === "cut" || params.animation === "pop")
        columns.forEach(settleColumn);
      if (params.animation === "pop") pop = 1;
      moved = true;
    }

    return {
      cue(key) {
        const limits = limitsOf(params);
        if (key === "increment") show(moveCount(count, params.step, limits));
        else if (key === "decrement")
          show(moveCount(count, -params.step, limits));
        else if (key === "reset") show(clampCount(params.start, limits));
      },
      update({
        dt,
        params: next,
        changed,
        width: nextWidth,
        height: nextHeight,
      }) {
        params = next;
        // Limits that moved past the count take it along.
        show(clampCount(count, limitsOf(params)));
        const digits = digitsOf(count, params.digits, MAX_DIGITS);
        if (digits.length !== columns.length) {
          columns = digits.map(
            (digit, index) => columns[index] ?? columnAt(digit),
          );
          moved = true;
        }
        const animating = columns.some(columnMoving) || pop > 0;
        for (const column of columns) stepColumn(column, dt, params.time);
        pop = Math.max(0, pop - dt / params.time);

        const stale =
          changed ||
          moved ||
          animating ||
          fonts !== text.version ||
          width !== nextWidth ||
          height !== nextHeight;
        moved = false;
        if (!stale) return { changed: false, blank: glyphs === undefined };
        fonts = text.version;
        width = nextWidth;
        height = nextHeight;

        const style = { font: params.font, letterSpacing: 0 };
        const measure = text.measure(style);
        const visible = params.fill[3] > 0 || shownOutline(params) > 0;
        if (measure === undefined || !visible) {
          glyphs = undefined;
          return { changed: true, blank: true };
        }
        // Widths in ems: every digit gets the widest one's.
        const cell = Math.max(...DIGITS.map(measure));
        const sign = count < 0 ? measure("-") : 0;
        const prefix = measure(params.prefix);
        const suffix = measure(params.suffix);
        const span = prefix + sign + cell * columns.length + suffix;
        const box = textBox(width, height, params.margin);
        if (span <= 0 || box.width <= 0 || box.height <= 0) {
          glyphs = undefined;
          return { changed: true, blank: true };
        }
        const size =
          params.fit === "fixed"
            ? params.size * height
            : params.size *
              (params.fit === "width"
                ? box.width / span
                : Math.min(box.width / span, box.height));
        const raster = {
          ...style,
          size: rasterSize(size),
          outline: shownOutline(params),
        };
        glyphs = text.rows({ ...raster, rows: [...DIGITS, "-"] });
        const affixes =
          prefix + suffix > 0
            ? text.rows({ ...raster, rows: [params.prefix, params.suffix] })
            : undefined;
        if (glyphs === undefined) return { changed: true, blank: true };

        // A Pop grows or shrinks the number about its center.
        const punch = 1 + POP * popDirection * pop * pop;
        const em = size * punch;
        const numberWidth = span * em;
        // Pixels on the Target per pixel of a picture, which may be drawn smaller than asked.
        const scaleOf = (rows: TextRows): number => em / rows.size;
        const rowHeight = glyphs.rowHeight * scaleOf(glyphs);
        const x = box.x + (box.width - numberWidth) / 2;
        const y = box.y + (box.height - rowHeight) / 2;

        const centers = new Float32Array(MAX_PIECES);
        const widths = new Float32Array(MAX_PIECES);
        const cells = new Float32Array(MAX_PIECES);
        let pieces = 0;
        let cursor = 0;
        const piece = (shown: number, ems: number): void => {
          if (ems > 0) {
            centers[pieces] = (cursor + ems / 2) / span;
            widths[pieces] = ems / span;
            cells[pieces] = shown;
            pieces += 1;
          }
          cursor += ems;
        };
        if (affixes !== undefined) piece(PREFIX_CELL, prefix);
        else cursor += prefix;
        piece(SIGN_CELL, sign);
        for (let index = columns.length - 1; index >= 0; index -= 1) {
          const column = columns[index];
          if (column !== undefined) piece(columnPlace(column), cell);
        }
        if (affixes !== undefined) piece(SUFFIX_CELL, suffix);

        const gridOf = (rows: TextRows): readonly [number, number] => [
          rows.columns,
          Math.round(rows.height / rows.rowHeight),
        ];
        const cellOf = (rows: TextRows): number =>
          (rows.cellWidth * scaleOf(rows)) / numberWidth;
        return {
          changed: true,
          blank: false,
          uniforms: {
            number_rect: [
              x / width,
              y / height,
              numberWidth / width,
              rowHeight / height,
            ],
            glyphs_grid: gridOf(glyphs),
            glyphs_cell: cellOf(glyphs),
            cell_inset: (glyphs.inset * scaleOf(glyphs)) / numberWidth,
            ...(affixes === undefined
              ? {}
              : {
                  affixes_grid: gridOf(affixes),
                  affixes_cell: cellOf(affixes),
                }),
            piece_count: pieces,
            piece_center: centers,
            piece_width: widths,
            piece_cell: cells,
          },
          textures: affixes === undefined ? { glyphs } : { glyphs, affixes },
        };
      },
    };
  },
});

function limitsOf(params: {
  readonly min: number;
  readonly max: number;
  readonly atLimit: "stop" | "wrap";
}) {
  return { min: params.min, max: params.max, atLimit: params.atLimit };
}
