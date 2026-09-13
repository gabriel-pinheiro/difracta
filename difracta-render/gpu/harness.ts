import { fileURLToPath } from "node:url";

import type { Document } from "@difracta/core";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll } from "vitest";

import type { FrameReport } from "../src/index.ts";
import type { RenderedFrames } from "./page.ts";
import { OUTPUT } from "./fixtures.ts";

/**
 * Drives the compositor in headless Chromium: the page is bundled once
 * with esbuild and served to Playwright at a secure origin (the document
 * model wants `crypto`), then every render is one `evaluate` that runs
 * the frames synchronously and hands back the pixels and reports.
 * SwiftShader provides WebGL2, so no GPU is needed.
 */
const ORIGIN = "https://gpu-suite.invalid/";

/** The last frame of a render, rows top first, with every frame's report. */
export interface Frame {
  readonly width: number;
  readonly height: number;
  /** RGBA, top row first. */
  readonly pixels: Uint8Array;
  readonly reports: readonly FrameReport[];
  /** The last frame's report. */
  readonly report: FrameReport;
}

export interface Renderer {
  render(
    document: Document,
    width: number,
    height: number,
    frames?: number,
  ): Promise<Frame>;
  close(): Promise<void>;
}

let script: Promise<string> | undefined;

function bundle(): Promise<string> {
  return (script ??= build({
    entryPoints: [fileURLToPath(new URL("./page.ts", import.meta.url))],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2022",
    // The Catalog module locates its thumbnails from its own URL; the page has none.
    define: { "import.meta.url": JSON.stringify(ORIGIN) },
    logLevel: "silent",
  }).then((result) => {
    const text = result.outputFiles[0]?.text;
    if (text === undefined) throw new Error("The page did not bundle.");
    return text;
  }));
}

export async function launchRenderer(): Promise<Renderer> {
  const browser: Browser = await chromium.launch({
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const page: Page = await browser.newPage();
  const escaped: Error[] = [];
  page.on("pageerror", (error) => escaped.push(error));
  await page.route(ORIGIN, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>GPU suite</title>",
    }),
  );
  await page.goto(ORIGIN);
  await page.addScriptTag({ content: await bundle() });
  return {
    async render(document, width, height, frames = 1) {
      const result: RenderedFrames = await page.evaluate(
        (options) =>
          window.render(
            options.document,
            options.outputId,
            options.width,
            options.height,
            options.frames,
          ),
        { document, outputId: OUTPUT, width, height, frames },
      );
      if (escaped.length > 0) {
        const messages = escaped.splice(0).map((error) => error.message);
        throw new Error(`The page threw: ${messages.join("; ")}`);
      }
      const report = result.reports.at(-1);
      if (report === undefined) throw new Error("No frame was rendered.");
      return {
        width,
        height,
        pixels: flipRows(Buffer.from(result.pixels, "base64"), width, height),
        reports: result.reports,
        report,
      };
    },
    close: () => browser.close(),
  };
}

/** WebGL reads the bottom row first; the tests think top first. */
function flipRows(bytes: Buffer, width: number, height: number): Uint8Array {
  const stride = width * 4;
  const flipped = new Uint8Array(bytes.length);
  for (let row = 0; row < height; row += 1)
    flipped.set(
      bytes.subarray(row * stride, (row + 1) * stride),
      (height - 1 - row) * stride,
    );
  return flipped;
}

/** One browser per test file: launched before the tests, closed after. */
export function withRenderer(): () => Renderer {
  let renderer: Renderer | undefined;
  beforeAll(async () => {
    renderer = await launchRenderer();
  });
  afterAll(async () => {
    await renderer?.close();
  });
  return () => {
    if (renderer === undefined) throw new Error("The browser is not up.");
    return renderer;
  };
}
