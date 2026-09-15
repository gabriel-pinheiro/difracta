import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type {} from "./flash-matrix-page.ts";

let browser: Browser;
let page: Page;

beforeAll(async () => {
  const bundle = await build({
    entryPoints: [
      fileURLToPath(new URL("./flash-matrix-page.ts", import.meta.url)),
    ],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2022",
    logLevel: "silent",
  });
  const script = bundle.outputFiles[0]?.text;
  if (script === undefined) throw new Error("The page did not bundle.");
  browser = await chromium.launch({
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  page = await browser.newPage();
  await page.addScriptTag({ content: script });
});

afterAll(async () => {
  await browser?.close();
});

// Sample the entire seed range, including the large seeds that broke the sine hash.
const seeds = Array.from({ length: 256 }, (_, index) => index * 16 + 15);
const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);

function samples(coverage: number, selectedSeeds = seeds): Promise<number[][]> {
  return page.evaluate(
    ({ coverage, selectedSeeds }) =>
      window.sampleFlashMatrix(coverage, selectedSeeds),
    { coverage, selectedSeeds },
  );
}

describe("Flash Matrix randomness", () => {
  it("averages two cells at 2% coverage, including with large seeds", async () => {
    const counts = (await samples(0.02)).map(sum);
    // Coverage is a probability: individual flashes must still vary in size.
    expect(new Set(counts).size).toBeGreaterThan(3);
    for (const group of [counts.slice(0, 128), counts.slice(128)]) {
      const average = sum(group) / group.length;
      expect(average).toBeGreaterThan(1.5);
      expect(average).toBeLessThan(2.5);
    }
  });

  it("spreads selection across cells without repeating neighboring patterns", async () => {
    const grids = await samples(0.5);
    for (let cell = 0; cell < 100; cell += 1) {
      const frequency =
        sum(grids.map((grid) => grid[cell] ?? 0)) / grids.length;
      expect(frequency).toBeGreaterThan(0.35);
      expect(frequency).toBeLessThan(0.65);
    }
    // Independent selections agree about half the time horizontally,
    // vertically and diagonally, including offsets longer than one cell.
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [1, 1],
      [3, 0],
      [5, 1],
    ] as const) {
      let matches = 0;
      let pairs = 0;
      for (const grid of grids)
        for (let y = 0; y < 10 - dy; y += 1)
          for (let x = 0; x < 10 - dx; x += 1) {
            if (grid[y * 10 + x] === grid[(y + dy) * 10 + x + dx]) matches += 1;
            pairs += 1;
          }
      expect(matches / pairs).toBeGreaterThan(0.47);
      expect(matches / pairs).toBeLessThan(0.53);
    }
  });

  it("repeats the same seed and lights every cell at full coverage", async () => {
    const repeated = await samples(0.35, [4095, 4095, 4094]);
    expect(repeated[0]).toEqual(repeated[1]);
    expect(repeated[0]).not.toEqual(repeated[2]);
    expect((await samples(1, [0, 2048, 4095])).map(sum)).toEqual([
      100, 100, 100,
    ]);
  });
});
