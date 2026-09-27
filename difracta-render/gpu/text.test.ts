import { readFile } from "node:fs/promises";

import { builtInCatalog, fontsRoot } from "@difracta/visuals";
import { describe, expect, it } from "vitest";

import { Stage } from "./fixtures.ts";
import { withRenderer, type Frame } from "./harness.ts";
import { countLit, litBounds, pixel, type Rect } from "./pixels.ts";

const renderer = withRenderer();

const fonts: Record<string, string> = Object.fromEntries(
  await Promise.all(
    builtInCatalog
      .fonts()
      .flatMap((font) => font.files)
      .map(async (file) => {
        const bytes = await readFile(new URL(file, fontsRoot));
        return [
          file,
          `data:font/woff2;base64,${bytes.toString("base64")}`,
        ] as const;
      }),
  ),
);

const WIDTH = 320;
const HEIGHT = 180;
const RED = [1, 0, 0, 1] as const;
const GREEN = [0, 1, 0, 1] as const;

function draw(
  visual: "text" | "counter",
  params: Readonly<Record<string, unknown>>,
  withFonts: Record<string, string> | undefined = fonts,
): Promise<Frame> {
  const stage = new Stage()
    .surface("wall")
    .visual("layer", "wall", visual, { params });
  return renderer().render(
    stage.document(),
    WIDTH,
    HEIGHT,
    10,
    undefined,
    withFonts,
  );
}

function bounds(frame: Frame): Rect {
  const lit = litBounds(frame);
  if (lit === undefined) throw new Error("Nothing was drawn.");
  return lit;
}

/** Pixels that are mostly `channel` (0 red, 1 green) and little of the other. */
function countOf(frame: Frame, channel: 0 | 1): number {
  let count = 0;
  for (let y = 0; y < frame.height; y += 1)
    for (let x = 0; x < frame.width; x += 1) {
      const color = pixel(frame, x, y);
      const other = channel === 0 ? color[1] : color[0];
      if (color[channel] > 200 && other < 60) count += 1;
    }
  return count;
}

describe("Text pixels", () => {
  it("fits the text inside the Margin, centered, in the Fill Color", async () => {
    const frame = await draw("text", {
      text: "HELLO",
      fill: RED,
      margin: 0.1,
    });
    const lit = bounds(frame);
    const margin = 0.1 * HEIGHT;
    expect(lit.x).toBeGreaterThanOrEqual(margin - 1);
    expect(lit.x + lit.width).toBeLessThanOrEqual(WIDTH - margin + 1);
    // The widest it can be: the word spans the box, less the letters' own side bearings.
    expect(lit.width).toBeGreaterThan(WIDTH - margin * 2 - 20);
    expect(Math.abs(lit.x + lit.width / 2 - WIDTH / 2)).toBeLessThan(4);
    expect(Math.abs(lit.y + lit.height / 2 - HEIGHT / 2)).toBeLessThan(10);
    expect(countOf(frame, 0)).toBeGreaterThan(1000);
    expect(countOf(frame, 1)).toBe(0);
    expect(frame.report.issues).toEqual([]);
  });

  it("aligns a Fixed text to either side and either end", async () => {
    const fixed = { text: "HI", fit: "fixed", size: 0.2, margin: 0.1 };
    const margin = 0.1 * HEIGHT;
    const left = bounds(
      await draw("text", { ...fixed, align: "left", vertical: "top" }),
    );
    expect(left.x).toBeLessThan(margin + 8);
    expect(left.y).toBeLessThan(margin + 0.2 * HEIGHT);
    expect(left.height).toBeLessThan(0.2 * HEIGHT);
    const right = bounds(
      await draw("text", { ...fixed, align: "right", vertical: "bottom" }),
    );
    expect(right.x + right.width).toBeGreaterThan(WIDTH - margin - 8);
    expect(right.y + right.height).toBeGreaterThan(
      HEIGHT - margin - 0.2 * HEIGHT,
    );
    expect(right.width).toBe(left.width);
  });

  it("wraps a Fixed text at the Margin and keeps typed line breaks", async () => {
    const one = bounds(
      await draw("text", { text: "HI", fit: "fixed", size: 0.15 }),
    );
    const typed = bounds(
      await draw("text", { text: "HI\nHI", fit: "fixed", size: 0.15 }),
    );
    expect(typed.height).toBeGreaterThan(one.height * 1.8);
    expect(typed.width).toBe(one.width);
    const wrapped = bounds(
      await draw("text", {
        text: "HHHHHHHH HHHHHHHH HHHHHHHH HHHHHHHH",
        fit: "fixed",
        size: 0.15,
      }),
    );
    expect(wrapped.height).toBeGreaterThan(one.height * 1.8);
    expect(wrapped.x + wrapped.width).toBeLessThanOrEqual(WIDTH);
  });

  it("draws the outline around the fill, in its own color", async () => {
    const plain = await draw("text", { text: "O", fill: RED });
    expect(countOf(plain, 1)).toBe(0);
    const outlined = await draw("text", {
      text: "O",
      fill: RED,
      outline: GREEN,
      outlineWidth: 0.05,
    });
    expect(countOf(outlined, 1)).toBeGreaterThan(200);
    expect(countOf(outlined, 0)).toBeGreaterThan(200);
    expect(bounds(outlined).width).toBeGreaterThan(bounds(plain).width);
  });

  it("draws in the Font chosen", async () => {
    const sans = bounds(
      await draw("text", { text: "MMMM", fit: "fixed", size: 0.2 }),
    );
    const condensed = bounds(
      await draw("text", {
        text: "MMMM",
        fit: "fixed",
        size: 0.2,
        font: "bebas-neue",
      }),
    );
    expect(condensed.width).toBeLessThan(sans.width * 0.8);
  });

  it("stays blank, without an issue, while no font has loaded", async () => {
    const stage = new Stage()
      .surface("wall")
      .visual("layer", "wall", "text", { params: { text: "HELLO" } });
    const frame = await renderer().render(stage.document(), WIDTH, HEIGHT, 5);
    expect(countLit(frame)).toBe(0);
    expect(frame.report.issues).toEqual([]);
  });
});

/** Pixels neither dark nor fully lit: the soft edge of a glyph, wider the more its picture was stretched. */
function countSoft(frame: Frame): number {
  let count = 0;
  for (let y = 0; y < frame.height; y += 1)
    for (let x = 0; x < frame.width; x += 1) {
      const [red] = pixel(frame, x, y);
      if (red > 40 && red < 215) count += 1;
    }
  return count;
}

describe("Counter pixels", () => {
  it("is as sharp as Text when it fills a large Target", async () => {
    const large = async (
      visual: "text" | "counter",
      params: Readonly<Record<string, unknown>>,
    ): Promise<Frame> => {
      const stage = new Stage()
        .surface("wall")
        .visual("layer", "wall", visual, { params });
      return renderer().render(
        stage.document(),
        1280,
        720,
        10,
        undefined,
        fonts,
      );
    };
    const words = await large("text", { text: "8", margin: 0 });
    const number = await large("counter", { start: 8, margin: 0 });
    expect(bounds(number).height).toBeGreaterThan(400);
    expect(countSoft(number)).toBeLessThan(countSoft(words) * 1.5);
  });

  it("shows its Start centered, and leading zeros up to Minimum Digits", async () => {
    const one = bounds(
      await draw("counter", { start: 8, fit: "fixed", size: 0.4 }),
    );
    expect(Math.abs(one.x + one.width / 2 - WIDTH / 2)).toBeLessThan(4);
    expect(Math.abs(one.y + one.height / 2 - HEIGHT / 2)).toBeLessThan(8);
    const three = bounds(
      await draw("counter", { start: 8, digits: 3, fit: "fixed", size: 0.4 }),
    );
    expect(three.width).toBeGreaterThan(one.width * 2.5);
    expect(Math.abs(three.x + three.width / 2 - WIDTH / 2)).toBeLessThan(4);
    expect(three.height).toBe(one.height);
  });

  it("gives every digit the same cell", async () => {
    const ones = bounds(
      await draw("counter", { start: 11, digits: 2, fit: "fixed", size: 0.4 }),
    );
    const eights = bounds(
      await draw("counter", { start: 88, digits: 2, fit: "fixed", size: 0.4 }),
    );
    // A 1 is narrower than an 8, but their centers are as far apart.
    expect(ones.width).toBeLessThan(eights.width);
    expect(
      Math.abs(ones.x + ones.width / 2 - (eights.x + eights.width / 2)),
    ).toBeLessThan(6);
  });

  it("draws the Prefix and the Suffix beside the number", async () => {
    const bare = bounds(
      await draw("counter", { start: 5, fit: "fixed", size: 0.3 }),
    );
    const dressed = bounds(
      await draw("counter", {
        start: 5,
        fit: "fixed",
        size: 0.3,
        prefix: "$",
        suffix: " pts",
      }),
    );
    expect(dressed.width).toBeGreaterThan(bare.width * 3);
  });

  it("fits the whole number in the Target", async () => {
    const frame = await draw("counter", {
      start: 100,
      digits: 6,
      margin: 0.05,
    });
    const lit = bounds(frame);
    expect(lit.x).toBeGreaterThanOrEqual(0.05 * HEIGHT - 1);
    expect(lit.x + lit.width).toBeLessThanOrEqual(WIDTH - 0.05 * HEIGHT + 1);
    expect(lit.width).toBeGreaterThan(WIDTH * 0.8);
  });
});
