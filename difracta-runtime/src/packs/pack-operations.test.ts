import { BASE_PROXY_HEIGHT, type Patch } from "@difracta/core";
import { access } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { FAKE_TOOLS, fakeRunner, tempDir, writeTree } from "./fixtures.ts";
import { proxyPath } from "./pack-folder.ts";
import { addPack, prepareProxy, rescanPack } from "./pack-operations.ts";
import { PackStore } from "./pack-store.ts";
import { PackRegistry } from "./registry.ts";

let done: (() => Promise<void>) | undefined;
let current: PackStore | undefined;
afterEach(async () => {
  await current?.idle();
  await done?.();
});

/** A store with one Pack, Neon, Prepared, whose video the fake ffprobe measures as 4K. */
async function stage(
  options: {
    readonly tools?: boolean;
    readonly failingOutputs?: readonly string[];
  } = {},
) {
  const temp = await tempDir();
  done = temp.done;
  const registry = new PackRegistry(path.join(temp.dir, "packs.json"));
  await registry.load();
  const runner = fakeRunner({
    size: { width: 3840, height: 2160 },
    failingOutputs: options.failingOutputs,
  });
  const store = new PackStore({
    bundledDir: path.join(temp.dir, "no-bundle"),
    registry,
    cacheRoot: path.join(temp.dir, "cache"),
    tools: options.tools === false ? undefined : FAKE_TOOLS,
    runner,
    log: () => undefined,
    random: () => 0.5,
  });
  current = store;
  const neon = path.join(temp.dir, "Neon");
  await writeTree(neon, { "a.mp4": "aaaa", "b.png": "bbbb" });
  const added = await addPack(store, neon);
  if (!added.ok) throw new Error(added.error);
  await store.idle();
  const patches: Patch[] = [];
  store.onChange((batch) => patches.push(...batch));
  const id = added.result.packId;
  const pack = () => store.state()[id]!;
  const dataDir = () => store.loaded().get(id)!.data!.dataDir;
  return { store, runner, neon, id, pack, dataDir, patches };
}

describe("prepareProxy", () => {
  it("bakes the proxy of the size asked, counted as one entry to go until it lands", async () => {
    const { store, runner, id, pack, dataDir, patches } = await stage();
    expect(pack().prepared).toEqual({ done: 2, total: 2 });
    const calls = runner.calls.length;
    const asked = await prepareProxy(store, id, "a", 1080);
    expect(asked).toEqual({
      ok: true,
      result: { packId: id, entryId: "a", baking: 1080 },
    });
    expect(pack().prepared).toEqual({ done: 1, total: 2 });
    // Asking again while it bakes queues nothing more.
    expect(await prepareProxy(store, id, "a", 1080)).toEqual(asked);
    await store.idle();
    expect(runner.calls.length).toBe(calls + 1);
    expect(runner.calls.at(-1)?.args).toContain("scale=-2:'min(1080,ih)'");
    expect(pack().prepared).toEqual({ done: 2, total: 2 });
    expect(pack().entries.a?.proxies).toEqual([BASE_PROXY_HEIGHT, 1080]);
    await access(proxyPath(dataDir(), pack().entries.a!.fingerprint, 1080));
    expect(patches.map((patch) => patch.path.join("/"))).toEqual([
      `packs/${id}/prepared`,
      `packs/${id}/prepared`,
      `packs/${id}/entries/a/proxies`,
    ]);
    // Baked, it is not baked again.
    expect(await prepareProxy(store, id, "a", 1080)).toMatchObject({
      result: { baking: null },
    });
    expect(runner.calls.length).toBe(calls + 1);
    // A rescan finds it by its file's name.
    await rescanPack(store, id);
    expect(pack().entries.a?.proxies).toEqual([BASE_PROXY_HEIGHT, 1080]);
  });

  it("has nothing to bake when the original serves the size, for an image, a size that is none, a read-only Pack or no ffmpeg", async () => {
    const { store, runner, id, pack } = await stage();
    const calls = runner.calls.length;
    const nothing = (entryId: string) => ({
      ok: true,
      result: { packId: id, entryId, baking: null },
    });
    // 4K at a few bytes a second fits the 4K size as it is.
    expect(await prepareProxy(store, id, "a", 2160)).toEqual(nothing("a"));
    expect(await prepareProxy(store, id, "a", 1000)).toEqual(nothing("a"));
    expect(await prepareProxy(store, id, "b", 1080)).toEqual(nothing("b"));
    expect(runner.calls.length).toBe(calls);
    expect(pack().prepared).toEqual({ done: 2, total: 2 });
    const bare = await stage({ tools: false });
    expect(await prepareProxy(bare.store, bare.id, "a", 1080)).toEqual({
      ok: true,
      result: { packId: bare.id, entryId: "a", baking: null },
    });
  });

  it("fails for a Pack that is not loaded, an entry the Pack lacks and a missing file", async () => {
    const { store, neon, id } = await stage();
    expect(await prepareProxy(store, "none-aaaa", "a", 1080)).toEqual({
      ok: false,
      error: "No Pack “none-aaaa” is loaded.",
    });
    const unknown = await prepareProxy(store, id, "zzz", 1080);
    expect(!unknown.ok && unknown.error).toContain("no entry “zzz”");
    const { rm } = await import("node:fs/promises");
    await rm(path.join(neon, "a.mp4"));
    await rescanPack(store, id);
    const gone = await prepareProxy(store, id, "a", 1080);
    expect(!gone.ok && gone.error).toContain("is missing");
  });

  it("stops counting a size it could not bake, and bakes it when asked again", async () => {
    const { store, runner, id, pack } = await stage({
      failingOutputs: [".720.mp4"],
    });
    expect(await prepareProxy(store, id, "a", 720)).toMatchObject({
      result: { baking: 720 },
    });
    expect(pack().prepared).toEqual({ done: 1, total: 2 });
    await store.idle();
    expect(pack().prepared).toEqual({ done: 2, total: 2 });
    expect(pack().entries.a?.proxies).toEqual([BASE_PROXY_HEIGHT]);
    const calls = runner.calls.length;
    expect(await prepareProxy(store, id, "a", 720)).toMatchObject({
      result: { baking: 720 },
    });
    await store.idle();
    expect(runner.calls.length).toBe(calls + 1);
  });

  it("bakes what was asked before the scan's own work", async () => {
    const { store, runner, id, neon, pack } = await stage();
    await writeTree(neon, { "c.mp4": "cccc", "d.mp4": "dddd" });
    await rescanPack(store, id);
    // The rescan started on `c`; the asked size passes `d`, still waiting.
    const calls = runner.calls.length;
    expect(await prepareProxy(store, id, "a", 1080)).toMatchObject({
      result: { baking: 1080 },
    });
    await store.idle();
    const outputs = runner.calls
      .slice(calls)
      .filter((call) => call.command.endsWith("ffmpeg"))
      .map((call) => path.basename(call.args.at(-1) ?? ""));
    const asked = outputs.findIndex((name) => name.endsWith(".1080.mp4"));
    const dThumb = outputs.findIndex(
      (name) => name === `${pack().entries.d!.fingerprint}.webp`,
    );
    expect(asked).toBeGreaterThanOrEqual(0);
    expect(asked).toBeLessThan(dThumb);
  });
});
