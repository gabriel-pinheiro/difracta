import type { Document } from "@difracta/core";

import { createCompositor, type FrameReport } from "../src/index.ts";
import { testCatalog } from "./test-catalog.ts";

/**
 * The browser half of the GPU suite. `render` runs a fresh
 * compositor over a document for a number of frames at 60 fps and reads
 * the last frame back with `gl.readPixels` before this task ends, since
 * the canvas keeps no drawing buffer past it. The pixels leave the page
 * as base64 RGBA, bottom row first as WebGL reads them; every frame's
 * report comes along.
 */
export interface RenderedFrames {
  readonly pixels: string;
  readonly reports: readonly FrameReport[];
}

export function render(
  document: Document,
  outputId: string,
  width: number,
  height: number,
  frames: number,
): RenderedFrames {
  const canvas = window.document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const compositor = createCompositor(canvas, testCatalog);
  const reports: FrameReport[] = [];
  for (let frame = 0; frame < frames; frame += 1)
    reports.push(
      compositor.render(document, outputId, width, height, (frame * 1000) / 60),
    );
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
