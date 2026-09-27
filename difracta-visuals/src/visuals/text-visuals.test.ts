import {
  createShaderPlayer,
  type ShaderVisual,
  type TextBlockRequest,
  type TextContext,
  type TextRowsRequest,
} from "@difracta/render/sdk";
import { describe, expect, it } from "vitest";

import { counter } from "./counter.ts";
import { text } from "./text.ts";

const DT = 1 / 60;
const WIDTH = 400;
const HEIGHT = 200;

/**
 * Text without a browser: every character half an em wide, pictures with
 * no margin, and a record of what was asked for. Fonts arrive when the
 * test says so.
 */
function fakeText() {
  const blocks: TextBlockRequest[] = [];
  const rows: TextRowsRequest[] = [];
  const state = { version: 0, ready: true };
  const width = (content: string): number => Array.from(content).length * 0.5;
  const context: TextContext = {
    get version() {
      return state.version;
    },
    measure: () => (state.ready ? width : undefined),
    block(request) {
      if (!state.ready) return undefined;
      blocks.push(request);
      return {
        id: request.lines.join(" "),
        image: {} as unknown as HTMLCanvasElement,
        width: Math.max(...request.lines.map(width)) * request.size,
        height: request.lines.length * request.lineHeight * request.size,
        version: 1,
        size: request.size,
        inset: 0,
      };
    },
    rows(request) {
      if (!state.ready) return undefined;
      rows.push(request);
      const cellWidth = Math.max(...request.rows.map(width)) * request.size;
      return {
        id: request.rows.join(" "),
        image: {} as unknown as HTMLCanvasElement,
        width: cellWidth,
        height: request.rows.length * request.size,
        version: 1,
        size: request.size,
        inset: 0,
        columns: 1,
        cellWidth,
        rowHeight: request.size,
        widths: request.rows.map((row) => width(row) * request.size),
      };
    },
  };
  return { context, blocks, rows, state };
}

function play(visual: ShaderVisual, fake = fakeText()) {
  const player = createShaderPlayer(visual, {
    width: 1,
    height: 1,
    seed: "layer",
    text: fake.context,
  });
  let values: Record<string, unknown> = {};
  return {
    ...fake,
    player,
    frame(next: Record<string, unknown> = values, dt = DT) {
      values = next;
      return player.frame(dt, values as never, WIDTH, HEIGHT);
    },
  };
}

const rect = (frame: { uniforms: Record<string, unknown> }, name: string) =>
  frame.uniforms[name] as readonly [number, number, number, number];

describe("Text", () => {
  it("draws its text once and rests until something changes", () => {
    const stage = play(text);
    const first = stage.frame({ text: "aaaa", margin: 0 });
    expect(first.blank).toBe(false);
    expect(first.changed).toBe(true);
    expect(stage.blocks).toHaveLength(1);
    expect(stage.blocks[0]?.lines).toEqual(["aaaa"]);
    expect(Object.keys(first.textures)).toEqual(["block"]);
    expect(stage.frame().changed).toBe(false);
    expect(stage.frame().changed).toBe(false);
    expect(stage.blocks).toHaveLength(1);
  });

  it("fits the block to the Target and centers it", () => {
    const stage = play(text);
    // Four characters are two ems: 200 pixels per em would span the width, the height allows 174.
    const frame = stage.frame({ text: "aaaa", margin: 0, lineHeight: 1 });
    const [x, y, width, height] = rect(frame, "block_rect");
    expect(width).toBeCloseTo(1);
    expect(height).toBeCloseTo(1);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(0);
    const half = stage.frame({
      text: "aaaa",
      margin: 0,
      lineHeight: 1,
      size: 0.5,
    });
    const [hx, hy, hw, hh] = rect(half, "block_rect");
    expect(hw).toBeCloseTo(0.5);
    expect(hh).toBeCloseTo(0.5);
    expect(hx).toBeCloseTo(0.25);
    expect(hy).toBeCloseTo(0.25);
  });

  it("places a Fixed block by Align and Vertical Align inside the Margin", () => {
    const stage = play(text);
    const fixed = {
      text: "aa",
      fit: "fixed",
      size: 0.25,
      lineHeight: 1,
      margin: 0.1,
    };
    // 50 pixels per em: the block is 50 by 50, the Margin 20.
    const [left, top, width, height] = rect(
      stage.frame({ ...fixed, align: "left", vertical: "top" }),
      "block_rect",
    );
    expect(left * WIDTH).toBeCloseTo(20);
    expect(top * HEIGHT).toBeCloseTo(20);
    expect(width * WIDTH).toBeCloseTo(50);
    expect(height * HEIGHT).toBeCloseTo(50);
    const [right, bottom] = rect(
      stage.frame({ ...fixed, align: "right", vertical: "bottom" }),
      "block_rect",
    );
    expect(right * WIDTH).toBeCloseTo(WIDTH - 20 - 50);
    expect(bottom * HEIGHT).toBeCloseTo(HEIGHT - 20 - 50);
  });

  it("moves colors and places without drawing the text again", () => {
    const stage = play(text);
    const base = { text: "aaaa", fit: "fixed", size: 0.2 };
    stage.frame(base);
    expect(stage.frame({ ...base, fill: [1, 0, 0, 1] }).changed).toBe(true);
    stage.frame({ ...base, align: "left", vertical: "bottom", margin: 0.2 });
    expect(
      new Set(stage.blocks.map((block) => JSON.stringify(block))).size,
    ).toBe(1);
  });

  it("asks for a larger picture only a few times along a sweep of Size", () => {
    const stage = play(text);
    for (let size = 0.5; size <= 1; size += 0.01)
      stage.frame({ text: "aaaa", size: Math.round(size * 100) / 100 });
    const sizes = new Set(stage.blocks.map((block) => block.size));
    expect(sizes.size).toBeLessThanOrEqual(5);
  });

  it("draws capitals with Uppercase and wraps a Fixed text", () => {
    const stage = play(text);
    stage.frame({
      text: "aaaa bbbb cccc",
      uppercase: true,
      fit: "fixed",
      size: 0.25,
      margin: 0,
    });
    // 400 pixels at 50 per em hold 16 characters.
    expect(stage.blocks.at(-1)?.lines).toEqual(["AAAA BBBB CCCC"]);
    stage.frame({
      text: "aaaa bbbb cccc",
      fit: "fixed",
      size: 0.5,
      margin: 0,
    });
    expect(stage.blocks.at(-1)?.lines).toEqual(["aaaa", "bbbb", "cccc"]);
  });

  it("asks for an outline only while it would show", () => {
    const stage = play(text);
    stage.frame({ text: "a", outlineWidth: 0.1, outline: [0, 0, 0, 0] });
    expect(stage.blocks.at(-1)?.outline).toBe(0);
    stage.frame({ text: "a", outlineWidth: 0.1, outline: [0, 0, 0, 1] });
    expect(stage.blocks.at(-1)?.outline).toBe(0.1);
  });

  it("is blank without text, without a color, and until its font arrives", () => {
    expect(play(text).frame({ text: "  " }).blank).toBe(true);
    expect(play(text).frame({ text: "a", fill: [1, 1, 1, 0] }).blank).toBe(
      true,
    );
    const stage = play(text);
    stage.state.ready = false;
    expect(stage.frame({ text: "a" }).blank).toBe(true);
    expect(stage.frame().changed).toBe(false);
    stage.state.ready = true;
    stage.state.version += 1;
    const arrived = stage.frame();
    expect(arrived.blank).toBe(false);
    expect(arrived.changed).toBe(true);
  });
});

/** The rows of the digits shown, left to right, as the fragment gets them. */
function shown(frame: { uniforms: Record<string, unknown> }): number[] {
  const count = frame.uniforms.piece_count as number;
  return Array.from(frame.uniforms.piece_cell as Float32Array).slice(0, count);
}

/** Runs frames until the Counter rests, and returns the last that changed. */
function settle(stage: ReturnType<typeof play>) {
  let last = stage.frame();
  for (let frame = 0; frame < 600; frame += 1) {
    const next = stage.frame();
    if (!next.changed) return last;
    last = next;
  }
  throw new Error("The Counter never came to rest.");
}

describe("Counter", () => {
  it("starts at Start and rests", () => {
    const stage = play(counter);
    const first = stage.frame({ start: 42 });
    expect(shown(first)).toEqual([4, 2]);
    expect(first.blank).toBe(false);
    expect(stage.frame().changed).toBe(false);
    expect(stage.rows).toHaveLength(1);
    expect(Object.keys(first.textures)).toEqual(["glyphs"]);
    expect(stage.rows[0]?.rows).toEqual([...Array.from("0123456789"), "-"]);
  });

  it("counts by Step on its Cues and returns to Start on Reset", () => {
    const stage = play(counter);
    stage.frame({ start: 5, step: 2, animation: "cut" });
    stage.player.cue("increment");
    expect(shown(stage.frame())).toEqual([7]);
    stage.player.cue("decrement");
    stage.player.cue("decrement");
    expect(shown(stage.frame())).toEqual([3]);
    stage.player.cue("reset");
    expect(shown(stage.frame())).toEqual([5]);
  });

  it("rolls each digit to the next over Animation Time", () => {
    const stage = play(counter);
    stage.frame({ start: 19, animation: "roll", time: 0.2 });
    stage.player.cue("increment");
    const moving = shown(stage.frame(undefined, 0.1));
    // Halfway: the tens between 1 and 2, the ones between 9 and 0.
    expect(moving[0]).toBeCloseTo(1.5);
    expect(moving[1]).toBeCloseTo(9.5);
    expect(shown(settle(stage))).toEqual([2, 0]);
  });

  it("counts every Cue of a burst and settles on the right number", () => {
    const stage = play(counter);
    stage.frame({ start: 0, animation: "roll", time: 0.5 });
    for (let cue = 0; cue < 10; cue += 1) {
      stage.player.cue("increment");
      expect(stage.frame().changed).toBe(true);
    }
    expect(shown(settle(stage))).toEqual([1, 0]);
  });

  it("stops at its limits, or wraps", () => {
    const stage = play(counter);
    stage.frame({ start: 9, max: 9, animation: "cut" });
    stage.player.cue("increment");
    expect(shown(stage.frame())).toEqual([9]);
    const wrapping = play(counter);
    wrapping.frame({ start: 9, max: 9, atLimit: "wrap", animation: "cut" });
    wrapping.player.cue("increment");
    expect(shown(wrapping.frame())).toEqual([0]);
  });

  it("keeps the count when Start changes, until Reset", () => {
    const stage = play(counter);
    const values = { start: 3, animation: "cut" };
    stage.frame(values);
    stage.player.cue("increment");
    stage.frame();
    expect(shown(stage.frame({ ...values, start: 50 }))).toEqual([4]);
    stage.player.cue("reset");
    expect(shown(stage.frame())).toEqual([5, 0]);
  });

  it("follows a limit that moves past the count", () => {
    const stage = play(counter);
    stage.frame({ start: 80, animation: "cut" });
    expect(
      shown(stage.frame({ start: 80, max: 20, animation: "cut" })),
    ).toEqual([2, 0]);
  });

  it("pads with zeros to Minimum Digits and shows the sign, Prefix and Suffix", () => {
    expect(shown(play(counter).frame({ start: 7, digits: 3 }))).toEqual([
      0, 0, 7,
    ]);
    const stage = play(counter);
    const dressed = stage.frame({
      start: -7,
      min: -9,
      prefix: "$",
      suffix: "x",
    });
    // 11 and 12 are the Prefix and the Suffix, 10 the sign.
    expect(shown(dressed)).toEqual([11, 10, 7, 12]);
    expect(stage.rows.at(-1)?.rows).toEqual(["$", "x"]);
    expect(Object.keys(dressed.textures)).toEqual(["glyphs", "affixes"]);
  });

  it("gives every digit a cell of the same width, centered in the Target", () => {
    const stage = play(counter);
    const frame = stage.frame({ start: 23, digits: 3, margin: 0 });
    const widths = Array.from(frame.uniforms.piece_width as Float32Array);
    const centers = Array.from(frame.uniforms.piece_center as Float32Array);
    expect(widths.slice(0, 3)).toEqual([widths[0], widths[0], widths[0]]);
    expect(centers[1]).toBeCloseTo(0.5);
    const [x, , width] = rect(frame, "number_rect");
    expect(x + width / 2).toBeCloseTo(0.5);
  });

  it("punches the whole number on a Pop, larger on the way up", () => {
    const stage = play(counter);
    const values = {
      start: 5,
      animation: "pop",
      time: 0.2,
      fit: "fixed",
      size: 0.2,
    };
    const rest = rect(stage.frame(values), "number_rect")[2];
    stage.player.cue("increment");
    const up = stage.frame();
    expect(shown(up)).toEqual([6]);
    expect(rect(up, "number_rect")[2]).toBeGreaterThan(rest);
    expect(rect(settle(stage), "number_rect")[2]).toBeCloseTo(rest);
    stage.player.cue("decrement");
    expect(rect(stage.frame(), "number_rect")[2]).toBeLessThan(rest);
  });

  it("is blank until its font arrives", () => {
    const stage = play(counter);
    stage.state.ready = false;
    expect(stage.frame({ start: 1 }).blank).toBe(true);
    stage.state.ready = true;
    stage.state.version += 1;
    expect(stage.frame().blank).toBe(false);
  });
});
