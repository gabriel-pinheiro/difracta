import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";

import { app, commandFromElsewhere } from "./harness.ts";

/**
 * What the Pack tests stand on: a folder with one image to make a Pack of,
 * written by hand so the suite needs no image tool, and an Installation
 * with an Output, a Surface and an Image Layer stretched over it, ready for
 * the picture to land on.
 */

const CRC_TABLE = new Uint32Array(256).map((_value, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes)
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, data.length);
  const typed = new Uint8Array([...Buffer.from(type, "latin1"), ...data]);
  const crc = new Uint8Array(4);
  new DataView(crc.buffer).setUint32(0, crc32(typed));
  return new Uint8Array([...length, ...typed, ...crc]);
}

/** A `size`×`size` PNG of one opaque colour, as the smallest valid file. */
export function solidPng(
  size: number,
  [red, green, blue]: readonly [number, number, number],
): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, size);
  view.setUint32(4, size);
  header.set([8, 2, 0, 0, 0], 8); // 8 bits, RGB, deflate, no filter, no interlace
  const raw = new Uint8Array(size * (1 + size * 3));
  for (let y = 0; y < size; y += 1) {
    const row = y * (1 + size * 3);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1)
      raw.set([red, green, blue], row + 1 + x * 3);
  }
  return new Uint8Array([
    ...[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    ...chunk("IHDR", header),
    ...chunk("IDAT", new Uint8Array(deflateSync(raw))),
    ...chunk("IEND", new Uint8Array()),
  ]);
}

/** A folder named `name` under `dir` holding `green.png`, a plain green picture: what becomes the Pack. */
export async function packFolder(dir: string, name: string): Promise<string> {
  const folder = path.join(dir, name);
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "green.png"), solidPng(16, [0, 255, 0]));
  return folder;
}

export const IMAGE_LAYER = "art";

/** An Output with a Surface, and a playing Scene whose Image Layer covers the Surface, with no image yet. */
export async function stageImage(port: string | undefined): Promise<void> {
  const run = (name: string, payload: unknown) =>
    commandFromElsewhere(port, name, payload);
  await run("output.create", { id: "wall", name: "Wall" });
  await run("surface.create", {
    id: "front",
    name: "Front",
    outputs: ["wall"],
  });
  await run("scene.create", { id: "show", name: "Show" });
  await run("layer.create", {
    id: IMAGE_LAYER,
    kind: "visual",
    sceneId: "show",
    target: "front",
    name: "Art",
  });
  await run("layer.visual", { layerId: IMAGE_LAYER, visual: "image" });
  await run("address.edit", {
    address: `layer/${IMAGE_LAYER}/param/fit`,
    value: "stretch",
  });
  await run("address.trigger", { address: "scene/show/play" });
}

/**
 * The colour at the middle of what the window showing `urlPart` displays,
 * read from the window itself rather than its canvas: a still picture is
 * drawn once and then left alone, so the WebGL canvas reads back empty on
 * the frames the compositor skips, while the screen keeps it.
 */
export async function middlePixelOnScreen(urlPart: string): Promise<number[]> {
  const pixel = await app?.evaluate(async ({ BrowserWindow }, part) => {
    const window = BrowserWindow.getAllWindows().find((candidate) =>
      candidate.webContents.getURL().includes(part),
    );
    if (window === undefined) return [];
    const image = await window.webContents.capturePage();
    const { width, height } = image.getSize();
    if (width === 0 || height === 0) return [];
    const bitmap = image.toBitmap();
    const at = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4;
    // BGRA on every platform.
    return [
      bitmap[at + 2] ?? 0,
      bitmap[at + 1] ?? 0,
      bitmap[at] ?? 0,
      bitmap[at + 3] ?? 0,
    ];
  }, urlPart);
  return pixel ?? [];
}
