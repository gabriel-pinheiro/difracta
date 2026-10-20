import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

import type { Frame } from "./harness.ts";

/**
 * Writes the frame as a PNG when DIFRACTA_GPU_DUMP names a folder, to look
 * at what a test drew; nothing otherwise.
 */
export async function dump(frame: Frame, name: string): Promise<void> {
  const folder = process.env.DIFRACTA_GPU_DUMP;
  if (folder === undefined || folder === "") return;
  const rows = Buffer.alloc((frame.width * 4 + 1) * frame.height);
  for (let y = 0; y < frame.height; y++) {
    const start = y * (frame.width * 4 + 1);
    rows[start] = 0;
    Buffer.from(
      frame.pixels.subarray(y * frame.width * 4, (y + 1) * frame.width * 4),
    ).copy(rows, start + 1);
  }
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(frame.width, 0);
  header.writeUInt32BE(frame.height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  await writeFile(
    join(folder, `${name}.png`),
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(rows)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
