// Writes the sample Media the Visuals package ships in `media/`: one small
// white-on-black PNG and one short white-on-black VP9 webm, for the Image
// and Video thumbnails and the GPU pixel tests. Run it when the pictures
// should change:
//
//   npm run sample-media -w @difracta/visuals
//
// The PNG is encoded here with only zlib, so it is the same bytes on every
// run; the video needs ffmpeg on the PATH.
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";

import { SAMPLE_IMAGE, SAMPLE_VIDEO, sampleMediaRoot } from "../src/index.ts";

const WIDTH = 128;
const HEIGHT = 72;
const SECONDS = 2;
const FPS = 30;

/**
 * The picture: a ring in the centre and a bar in the top-left corner, so
 * a test can tell the picture's orientation and the Fit's crop from the
 * pixels. Rows top first, one white or black byte per pixel.
 */
function picture(): Uint8Array {
  const pixels = new Uint8Array(WIDTH * HEIGHT);
  for (let y = 0; y < HEIGHT; y += 1)
    for (let x = 0; x < WIDTH; x += 1) {
      const radius = Math.hypot(x + 0.5 - WIDTH / 2, y + 0.5 - HEIGHT / 2);
      const ring = radius >= 20 && radius < 28;
      const bar = x >= 6 && x < 38 && y >= 6 && y < 14;
      pixels[y * WIDTH + x] = ring || bar ? 255 : 0;
    }
  return pixels;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const typed = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

/** A greyscale PNG (color type 0, 8 bits) with every row unfiltered. */
function png(pixels: Uint8Array): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0);
  header.writeUInt32BE(HEIGHT, 4);
  header[8] = 8; // bit depth
  header[9] = 0; // greyscale
  const rows = Buffer.alloc((WIDTH + 1) * HEIGHT);
  for (let y = 0; y < HEIGHT; y += 1)
    rows.set(pixels.subarray(y * WIDTH, (y + 1) * WIDTH), y * (WIDTH + 1) + 1);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

/** A white square crossing the frame left to right over the clip, in the middle band. */
function video(file: string): void {
  const square = `between(X,8+T*40,40+T*40)*between(Y,24,48)`;
  execFileSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=black:s=${WIDTH}x${HEIGHT}:r=${FPS}:d=${SECONDS}`,
      "-vf",
      `geq=lum='if(gt(${square},0),255,0)':cb=128:cr=128`,
      "-c:v",
      "libvpx-vp9",
      "-crf",
      "45",
      "-b:v",
      "0",
      "-pix_fmt",
      "yuv420p",
      file,
    ],
    { stdio: "inherit" },
  );
}

await mkdir(sampleMediaRoot, { recursive: true });
const imageFile = fileURLToPath(new URL(SAMPLE_IMAGE, sampleMediaRoot));
await writeFile(imageFile, png(picture()));
console.log(`image → ${imageFile}`);
const videoFile = fileURLToPath(new URL(SAMPLE_VIDEO, sampleMediaRoot));
video(videoFile);
console.log(`video → ${videoFile}`);
