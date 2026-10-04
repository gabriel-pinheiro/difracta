import type { Document } from "@difracta/core";

import {
  createCompositor,
  dataUrlMediaType,
  fakePacks,
  loopbackShares,
  type FrameReport,
} from "../src/index.ts";
import { testCatalog } from "./test-catalog.ts";

/**
 * The browser half of the GPU suite. `render` runs a fresh
 * compositor over a document for a number of frames at 60 fps and reads
 * the last frame back with `gl.readPixels` before this task ends, since
 * the canvas keeps no drawing buffer past it. The pixels leave the page
 * as base64 RGBA, bottom row first as WebGL reads them; every frame's
 * report comes along. With Media (data URLs by Media reference, each made
 * an entry of a loaded Pack of the type its data URL says) the frames are
 * paced by the browser's, since the files load on its clock, they go on
 * until a Layer has drawn, and the last one is forced by a new revision so
 * the picture is in the buffer when it is read. With fonts (data URLs by
 * file name) the Bundled Fonts load and the frames are paced the same way.
 * With shares (a picture's data URL by Screen Share id) each slot is shared
 * from inside the page (`loopback-share.ts`): the picture, enlarged with
 * its edges kept hard, is drawn on a canvas every frame and the canvas's
 * stream is what the engine's Viewer receives. The frames asked for are
 * then counted from the moment every share is connected, so the picture
 * has arrived by the one that is read.
 */
export interface RenderedFrames {
  readonly pixels: string;
  readonly reports: readonly FrameReport[];
}

/** How much a shared picture is enlarged, so the encoder has something of a screen's size. */
const SHARE_SCALE = 5;

/** A stream of the picture at `url`, and what keeps it running and ends it. */
async function shareOf(url: string): Promise<{
  readonly stream: MediaStream;
  readonly draw: () => void;
  readonly stop: () => void;
}> {
  const picture = new Image();
  picture.src = url;
  await picture.decode();
  const canvas = window.document.createElement("canvas");
  canvas.width = picture.naturalWidth * SHARE_SCALE;
  canvas.height = picture.naturalHeight * SHARE_SCALE;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("No canvas to share from.");
  context.imageSmoothingEnabled = false;
  // A canvas's stream has a frame only when the canvas was drawn on.
  const draw = (): void => {
    context.drawImage(picture, 0, 0, canvas.width, canvas.height);
  };
  draw();
  const stream = canvas.captureStream();
  return {
    stream,
    draw,
    stop: () => {
      for (const track of stream.getTracks()) track.stop();
    },
  };
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
  fonts?: Readonly<Record<string, string>>,
  shares?: Readonly<Record<string, string>>,
): Promise<RenderedFrames> {
  const canvas = window.document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const shared = await Promise.all(
    Object.entries(shares ?? {}).map(
      async ([id, url]) => [id, await shareOf(url)] as const,
    ),
  );
  const compositor = createCompositor(canvas, testCatalog, {
    mediaUrl: (id) => media?.[id],
    fontUrl: (file) => fonts?.[file],
    ...(shares === undefined
      ? {}
      : {
          shares: loopbackShares(
            Object.fromEntries(shared.map(([id, { stream }]) => [id, stream])),
          ),
        }),
  });
  compositor.setPacks(
    fakePacks(
      Object.fromEntries(
        Object.entries(media ?? {}).flatMap(([reference, url]) => {
          const type = dataUrlMediaType(url);
          return type === undefined ? [] : [[reference, type] as const];
        }),
      ),
    ),
  );
  const reports: FrameReport[] = [];
  const paced =
    media !== undefined || fonts !== undefined || shares !== undefined;
  const started = performance.now();
  let drawn = false;
  // The frames asked for are counted from the one after every share connected.
  let since: number | undefined = shared.length === 0 ? 0 : undefined;
  for (let frame = 0; ; frame += 1) {
    const past = since === undefined ? -1 : frame - since;
    if (since !== undefined && past >= frames && !(paced && !drawn)) break;
    const now = paced ? await nextFrame() : (frame * 1000) / 60;
    for (const [, share] of shared) share.draw();
    const last = past >= frames - 1;
    const report = compositor.render(
      paced && last ? { ...document } : document,
      outputId,
      width,
      height,
      now,
    );
    reports.push(report);
    drawn ||= report.shaders.rendered > 0 || report.layers.rendered > 0;
    if (since === undefined && report.shares.connected >= shared.length)
      since = frame + 1;
    const waiting = since === undefined || !drawn;
    if (paced && waiting && performance.now() - started > MEDIA_WAIT_MS) break;
  }
  const gl = canvas.getContext("webgl2");
  if (gl === null) throw new Error("The compositor's context is gone.");
  const bytes = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  compositor.dispose();
  for (const [, share] of shared) share.stop();
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
