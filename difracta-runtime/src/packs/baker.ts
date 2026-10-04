import { settings, type FileMediaType } from "@difracta/core";
import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import {
  defaultThumbnailAt,
  parseProbe,
  probeArgs,
  proxyArgs,
  thumbnailArgs,
  type Probe,
} from "./bake-jobs.ts";
import { proxyPath, thumbnailPath } from "./pack-folder.ts";
import type { BakeTools } from "./tools.ts";

/** Runs one tool to completion; the baker never reads its output but ffprobe's. */
export interface BakeRunner {
  run(
    command: string,
    args: readonly string[],
  ): Promise<{ readonly exitCode: number; readonly stdout: string }>;
}

/** One entry to bring to Prepared: what it is and what it still lacks. */
export interface BakeJob {
  readonly packId: string;
  readonly entryId: string;
  /** The entry's file, absolute. */
  readonly file: string;
  readonly type: FileMediaType;
  readonly fingerprint: string;
  readonly dataDir: string;
  readonly thumbnailAt: number | undefined;
  readonly duration: number | undefined;
  readonly needs: {
    readonly probe: boolean;
    readonly thumbnail: boolean;
    readonly proxy: boolean;
  };
}

/** What a job produced: measurements when probed, and which files exist now. */
export interface BakeResult {
  readonly packId: string;
  readonly entryId: string;
  readonly probe: Probe | undefined;
  readonly hasThumbnail: boolean;
  readonly hasProxy: boolean;
  readonly error: string | undefined;
}

export interface BakerOptions {
  readonly tools: BakeTools;
  readonly runner?: BakeRunner | undefined;
  readonly concurrency?: number | undefined;
  readonly onBaked: (result: BakeResult) => void;
  readonly log: (message: string) => void;
}

/**
 * Spawns a tool under `nice` at `settings.packs.bake.nice` (plain on
 * Windows, which has no `nice`), so baking never competes with a show.
 */
export function spawnRunner(
  platform: NodeJS.Platform = process.platform,
): BakeRunner {
  return {
    run: (command, args) =>
      new Promise((resolve, reject) => {
        const [bin, argv] =
          platform === "win32"
            ? [command, [...args]]
            : [
                "nice",
                ["-n", String(settings.packs.bake.nice), command, ...args],
              ];
        const child = spawn(bin, argv, { stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";
        child.stdout.on(
          "data",
          (chunk: Buffer) => (stdout += chunk.toString()),
        );
        child.stderr.on(
          "data",
          (chunk: Buffer) => (stderr += chunk.toString()),
        );
        child.on("error", reject);
        child.on("close", (code) => {
          if (code === 0) resolve({ exitCode: 0, stdout });
          else
            resolve({
              exitCode: code ?? 1,
              stdout: stderr.trim().split("\n").slice(-3).join(" "),
            });
        });
      }),
  };
}

/**
 * The bake queue: entries that lack a measurement, a thumbnail or a proxy,
 * done `settings.packs.bake.concurrency` at a time, each job probing first
 * so a video's default thumbnail time has a duration to work from. Every
 * finished entry, failed ones included, is reported; a failure is logged
 * and the entry is not tried again this run. A Pack's pending jobs are
 * dropped when it unloads.
 */
export class Baker {
  readonly #options: BakerOptions;
  readonly #runner: BakeRunner;
  readonly #queue: BakeJob[] = [];
  readonly #cancelled = new Set<string>();
  #running = 0;
  #idle: (() => void)[] = [];

  constructor(options: BakerOptions) {
    this.#options = options;
    this.#runner = options.runner ?? spawnRunner();
  }

  enqueue(jobs: readonly BakeJob[]): void {
    for (const job of jobs) {
      this.#cancelled.delete(job.packId);
      this.#queue.push(job);
    }
    this.#pump();
  }

  /** Drops the pending jobs of `packId`; one running finishes and is reported. */
  cancel(packId: string): void {
    this.#cancelled.add(packId);
    for (let index = this.#queue.length - 1; index >= 0; index -= 1)
      if (this.#queue[index]?.packId === packId) this.#queue.splice(index, 1);
  }

  /** Whether `packId` has jobs waiting or running. */
  pending(packId: string): number {
    return this.#queue.filter((job) => job.packId === packId).length;
  }

  /** Resolves once nothing is queued or running. */
  idle(): Promise<void> {
    if (this.#running === 0 && this.#queue.length === 0)
      return Promise.resolve();
    return new Promise((resolve) => this.#idle.push(resolve));
  }

  #pump(): void {
    const concurrency =
      this.#options.concurrency ?? settings.packs.bake.concurrency;
    while (this.#running < concurrency) {
      const job = this.#queue.shift();
      if (job === undefined) break;
      this.#running += 1;
      void this.#bake(job).then((result) => {
        this.#running -= 1;
        if (!this.#cancelled.has(job.packId)) this.#options.onBaked(result);
        this.#pump();
      });
    }
    if (this.#running === 0 && this.#queue.length === 0) {
      const waiting = this.#idle;
      this.#idle = [];
      for (const resolve of waiting) resolve();
    }
  }

  async #bake(job: BakeJob): Promise<BakeResult> {
    const { ffmpeg, ffprobe } = this.#options.tools;
    const result = {
      packId: job.packId,
      entryId: job.entryId,
      probe: undefined as Probe | undefined,
      hasThumbnail: !job.needs.thumbnail,
      hasProxy: !job.needs.proxy && job.type === "video",
      error: undefined as string | undefined,
    };
    const fail = (what: string, detail: string): BakeResult => {
      const error = `${what} of ${job.file} failed: ${detail}`;
      this.#options.log(error);
      return { ...result, error };
    };
    try {
      let duration = job.duration;
      if (job.needs.probe) {
        const probed = await this.#runner.run(ffprobe, probeArgs(job.file));
        const probe =
          probed.exitCode === 0
            ? parseProbe(probed.stdout, job.type)
            : undefined;
        if (probe === undefined)
          return fail("Probing", probed.stdout || "no picture found");
        result.probe = probe;
        duration = probe.duration ?? duration;
      }
      if (job.needs.thumbnail) {
        const out = thumbnailPath(job.dataDir, job.fingerprint);
        await mkdir(path.dirname(out), { recursive: true });
        const at = job.thumbnailAt ?? defaultThumbnailAt(duration);
        const ran = await this.#runner.run(
          ffmpeg,
          thumbnailArgs(job.file, out, job.type, at),
        );
        if (ran.exitCode !== 0) {
          await rm(out, { force: true });
          return fail("The thumbnail", ran.stdout);
        }
        result.hasThumbnail = true;
      }
      if (job.needs.proxy) {
        const out = proxyPath(job.dataDir, job.fingerprint);
        await mkdir(path.dirname(out), { recursive: true });
        const ran = await this.#runner.run(ffmpeg, proxyArgs(job.file, out));
        if (ran.exitCode !== 0) {
          await rm(out, { force: true });
          return fail("The proxy", ran.stdout);
        }
        result.hasProxy = true;
      }
      return result;
    } catch (error) {
      return fail("Baking", String(error));
    }
  }
}
