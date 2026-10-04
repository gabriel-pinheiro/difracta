import { settings } from "@difracta/core";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  defaultThumbnailAt,
  parseProbe,
  proxyArgs,
  thumbnailArgs,
} from "./bake-jobs.ts";
import { Baker, spawnRunner, type BakeJob, type BakeResult } from "./baker.ts";
import { FAKE_TOOLS, fakeRunner, tempDir, writeTree } from "./fixtures.ts";
import { loadPackFolder } from "./pack-folder.ts";
import { bakeJobsFor } from "./pack-loading.ts";
import { locateTools } from "./tools.ts";

const realTools = await locateTools();
let done: (() => Promise<void>) | undefined;
afterEach(async () => {
  await done?.();
});

describe("bake plans", () => {
  it("reproduce the Bundled Pack's settings", () => {
    expect(thumbnailArgs("/p/a.mp4", "/d/t.webp", "video", 1.5)).toEqual([
      "-y",
      "-ss",
      "1.5",
      "-i",
      "/p/a.mp4",
      "-frames:v",
      "1",
      "-vf",
      "scale=640:360:force_original_aspect_ratio=decrease",
      "-c:v",
      "libwebp",
      "-quality",
      "80",
      "/d/t.webp",
    ]);
    expect(thumbnailArgs("/p/a.png", "/d/t.webp", "image", 0)).not.toContain(
      "-ss",
    );
    expect(proxyArgs("/p/a.mp4", "/d/p.mp4")).toEqual([
      "-y",
      "-i",
      "/p/a.mp4",
      "-an",
      "-vf",
      "scale=-2:'min(480,ih)'",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-b:v",
      "1500k",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "/d/p.mp4",
    ]);
    expect(defaultThumbnailAt(8)).toBe(8 * settings.packs.thumbnail.defaultAt);
    expect(defaultThumbnailAt(undefined)).toBe(0);
  });

  it("read ffprobe's answer", () => {
    const stdout = JSON.stringify({
      streams: [{ width: 1920, height: 1080, codec: "h264" }],
      format: { duration: "7.100000" },
    });
    expect(parseProbe(stdout, "video")).toEqual({
      width: 1920,
      height: 1080,
      duration: 7.1,
    });
    expect(parseProbe(stdout, "image")).toEqual({ width: 1920, height: 1080 });
    expect(parseProbe("{}", "video")).toBeUndefined();
    expect(parseProbe("not json", "video")).toBeUndefined();
  });
});

describe("Baker", () => {
  async function stagedPack() {
    const temp = await tempDir();
    done = temp.done;
    const pack = path.join(temp.dir, "neon");
    await writeTree(pack, {
      "a.mp4": "aaaa",
      "b.png": "bbbb",
      "c.webm": "cccc",
    });
    const loaded = await loadPackFolder(pack, {
      cacheRoot: path.join(temp.dir, "cache"),
    });
    if (!loaded.ok) throw new Error(loaded.error);
    // `b` is already baked: its thumbnail exists and it was measured.
    const b = loaded.pack.manifest.entries.find((entry) => entry.id === "b")!;
    const data = {
      ...loaded.pack,
      manifest: {
        ...loaded.pack.manifest,
        entries: loaded.pack.manifest.entries.map((entry) =>
          entry.id === "b" ? { ...entry, width: 2, height: 2 } : entry,
        ),
      },
      thumbnails: new Set([b.fingerprint]),
    };
    return { pack, data };
  }

  it("skips prepared entries, probes before the thumbnail and reports each entry in turn", async () => {
    const { data } = await stagedPack();
    const jobs = bakeJobsFor("neon", data);
    expect(jobs.map((job) => [job.entryId, job.needs])).toEqual([
      ["a", { probe: true, thumbnail: true, proxy: true }],
      ["c", { probe: true, thumbnail: true, proxy: true }],
    ]);
    const runner = fakeRunner();
    const results: BakeResult[] = [];
    const baker = new Baker({
      tools: FAKE_TOOLS,
      runner,
      onBaked: (result) => results.push(result),
      log: () => undefined,
    });
    baker.enqueue(jobs);
    await baker.idle();
    expect(
      results.map((result) => [
        result.entryId,
        result.hasThumbnail,
        result.hasProxy,
        result.probe?.duration,
        result.error,
      ]),
    ).toEqual([
      ["a", true, true, 2, undefined],
      ["c", true, true, 2, undefined],
    ]);
    expect(runner.calls.map((call) => path.basename(call.command))).toEqual([
      "ffprobe",
      "ffmpeg",
      "ffmpeg",
      "ffprobe",
      "ffmpeg",
      "ffmpeg",
    ]);
    // The thumbnail is taken a quarter of the way in, from the probed duration.
    expect(runner.calls[1]?.args.slice(0, 3)).toEqual(["-y", "-ss", "0.5"]);
    await access(
      path.join(data.dataDir, "thumbs", `${jobs[0]!.fingerprint}.webp`),
    );
    await access(
      path.join(data.dataDir, "proxies", `${jobs[0]!.fingerprint}.mp4`),
    );
  });

  it("reports a failure, keeps going and drops a cancelled Pack's jobs", async () => {
    const { data } = await stagedPack();
    const runner = fakeRunner({ failing: ["a.mp4"] });
    const results: BakeResult[] = [];
    const logged: string[] = [];
    const baker = new Baker({
      tools: FAKE_TOOLS,
      runner,
      onBaked: (result) => results.push(result),
      log: (message) => logged.push(message),
    });
    const jobs = bakeJobsFor("neon", data);
    const other: BakeJob = { ...jobs[1]!, packId: "other" };
    baker.enqueue([...jobs, other]);
    baker.cancel("other");
    await baker.idle();
    expect(
      results.map((result) => [
        result.packId,
        result.entryId,
        result.error === undefined,
      ]),
    ).toEqual([
      ["neon", "a", false],
      ["neon", "c", true],
    ]);
    expect(logged[0]).toContain("a.mp4");
    expect(baker.pending("other")).toBe(0);
  });

  it.skipIf(realTools === undefined)(
    "bakes a real clip with ffmpeg",
    async () => {
      const tools = realTools!;
      const temp = await tempDir();
      done = temp.done;
      const pack = path.join(temp.dir, "real");
      await mkdir(pack, { recursive: true });
      const clip = path.join(pack, "test.mp4");
      const made = await spawnRunner().run(tools.ffmpeg, [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc=duration=1:size=64x36:rate=10",
        "-pix_fmt",
        "yuv420p",
        clip,
      ]);
      expect(made.exitCode).toBe(0);
      await writeFile(
        path.join(pack, "still.png"),
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
          "base64",
        ),
      );
      const loaded = await loadPackFolder(pack, {
        cacheRoot: path.join(temp.dir, "cache"),
      });
      if (!loaded.ok) throw new Error(loaded.error);
      const results: BakeResult[] = [];
      const baker = new Baker({
        tools,
        onBaked: (result) => results.push(result),
        log: () => undefined,
      });
      baker.enqueue(bakeJobsFor("real", loaded.pack));
      await baker.idle();
      const video = results.find((result) => result.entryId === "test");
      expect(video).toMatchObject({
        hasThumbnail: true,
        hasProxy: true,
        error: undefined,
      });
      expect(video?.probe).toMatchObject({ width: 64, height: 36 });
      expect(video?.probe?.duration).toBeCloseTo(1, 1);
      expect(
        results.find((result) => result.entryId === "still"),
      ).toMatchObject({
        hasThumbnail: true,
        hasProxy: false,
        probe: { width: 1, height: 1 },
      });
    },
    30_000,
  );
});
