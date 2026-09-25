import type { Document } from "@difracta/core";

import { createCompositor, type FrameReport } from "../src/index.ts";
import { testCatalog } from "./test-catalog.ts";

/**
 * The browser half of the GPU suite. `render` runs a fresh
 * compositor over a document for a number of frames at 60 fps and reads
 * the last frame back with `gl.readPixels` before this task ends, since
 * the canvas keeps no drawing buffer past it. The pixels leave the page
 * as base64 RGBA, bottom row first as WebGL reads them; every frame's
 * report comes along. With Media (data URLs by item id) the frames are
 * paced by the browser's, since the files load on its clock, they go on
 * until a Layer has drawn, and the last one is forced by a new revision so
 * the picture is in the buffer when it is read.
 */
export interface RenderedFrames {
  readonly pixels: string;
  readonly reports: readonly FrameReport[];
}

/** How long a paced render may wait for a Layer to draw past its frames. */
const MEDIA_WAIT_MS = 10_000;

const nextFrame = (): Promise<number> =>
  new Promise((resolve) => requestAnimationFrame(resolve));

export async function render(
  document: Document,
  outputId: string,
  width: number,
  height: number,
  frames: number,
  media?: Readonly<Record<string, string>>,
): Promise<RenderedFrames> {
  const canvas = window.document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const compositor = createCompositor(canvas, testCatalog, {
    mediaUrl: (id) => media?.[id],
  });
  const reports: FrameReport[] = [];
  const paced = media !== undefined;
  const started = performance.now();
  let drawn = false;
  for (let frame = 0; frame < frames || (paced && !drawn); frame += 1) {
    const now = paced ? await nextFrame() : (frame * 1000) / 60;
    const last = frame >= frames - 1;
    const report = compositor.render(
      paced && last ? { ...document } : document,
      outputId,
      width,
      height,
      now,
    );
    reports.push(report);
    drawn ||= report.shaders.rendered > 0 || report.layers.rendered > 0;
    if (paced && !drawn && performance.now() - started > MEDIA_WAIT_MS) break;
  }
  const gl = canvas.getContext("webgl2");
  if (gl === null) throw new Error("The compositor's context is gone.");
  const bytes = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  compositor.dispose();
  return { pixels: encode(bytes), reports };
}

function encode(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  return btoa(binary);
}

declare global {
  interface Window {
    render: typeof render;
  }
}

window.render = render;
