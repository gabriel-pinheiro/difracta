import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { BakeRunner } from "./baker.ts";

/** A temp folder for one test, removed with `done`. */
export async function tempDir(
  prefix = "difracta-packs-",
): Promise<{ dir: string; done: () => Promise<void> }> {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  return { dir, done: () => rm(dir, { recursive: true, force: true }) };
}

/** Writes `files` (POSIX paths → content) under `root`, folders included. */
export async function writeTree(
  root: string,
  files: Readonly<Record<string, string>>,
): Promise<void> {
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(root, ...file.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
}

/**
 * A runner standing in for ffmpeg and ffprobe: ffprobe answers a picture
 * of `size`, 64×36 unless said, 2 s long for a video; ffmpeg writes a few
 * bytes to its output, the last argument. Every call is recorded.
 * `failing` names files whose jobs fail, `failingOutputs` the endings of
 * the outputs ffmpeg fails to write.
 */
export function fakeRunner(
  options: {
    readonly failing?: readonly string[] | undefined;
    readonly failingOutputs?: readonly string[] | undefined;
    readonly size?:
      { readonly width: number; readonly height: number } | undefined;
  } = {},
): BakeRunner & {
  readonly calls: { command: string; args: readonly string[] }[];
} {
  const calls: { command: string; args: readonly string[] }[] = [];
  return {
    calls,
    async run(command, args) {
      calls.push({ command, args });
      const input =
        (args.includes("-i") ? args[args.indexOf("-i") + 1] : args.at(-1)) ??
        "";
      if (options.failing?.some((file) => input.endsWith(file)) === true)
        return { exitCode: 1, stdout: "Invalid data found" };
      if (command.endsWith("ffprobe")) {
        const video = /\.(mp4|webm|mov)$/.test(input);
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            streams: [options.size ?? { width: 64, height: 36 }],
            format: video ? { duration: "2.000000" } : {},
          }),
        };
      }
      const out = args.at(-1) ?? "";
      if (options.failingOutputs?.some((end) => out.endsWith(end)) === true)
        return { exitCode: 1, stdout: "Conversion failed" };
      await mkdir(path.dirname(out), { recursive: true });
      await writeFile(out, `baked ${path.basename(out)}`);
      return { exitCode: 0, stdout: "" };
    },
  };
}

export const FAKE_TOOLS = { ffmpeg: "/fake/ffmpeg", ffprobe: "/fake/ffprobe" };
