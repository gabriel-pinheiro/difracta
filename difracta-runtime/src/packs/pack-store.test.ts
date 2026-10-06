import { bundledRoot } from "@difracta/visuals";
import { BASE_PROXY_HEIGHT, type Patch } from "@difracta/core";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { FAKE_TOOLS, fakeRunner, tempDir, writeTree } from "./fixtures.ts";
import { loadPackFolder, writeManifest } from "./pack-folder.ts";
import {
  addPack,
  locatePack,
  renamePackEverywhere,
  rescanPack,
  updatePackEntry,
} from "./pack-operations.ts";
import { PackStore } from "./pack-store.ts";
import { PackRegistry } from "./registry.ts";

let done: (() => Promise<void>) | undefined;
let current: PackStore | undefined;
afterEach(async () => {
  await current?.idle();
  await done?.();
});

const bundledDir = fileURLToPath(bundledRoot);

/** A store over a temp Registry and cache, with a fake ffmpeg unless `tools` says none. */
async function stage(options: { tools?: boolean } = {}) {
  const temp = await tempDir();
  done = temp.done;
  const registry = new PackRegistry(
    path.join(temp.dir, "config", "packs.json"),
  );
  await registry.load();
  const patches: Patch[] = [];
  const runner = fakeRunner();
  const store = new PackStore({
    bundledDir,
    registry,
    cacheRoot: path.join(temp.dir, "cache"),
    tools: options.tools === false ? undefined : FAKE_TOOLS,
    runner,
    log: () => undefined,
    random: () => 0.5,
  });
  store.onChange((batch) => patches.push(...batch));
  current = store;
  const neon = path.join(temp.dir, "shows", "media", "Neon");
  await writeTree(neon, { "loops/a.mp4": "aaaa", "b.png": "bbbb" });
  const show = path.join(temp.dir, "shows", "live.difracta");
  return { dir: temp.dir, registry, store, patches, runner, neon, show };
}

const source = (
  packs: Record<string, { id: string; name: string; relativePath?: string }>,
  file: string | null,
) => ({
  document: { packs },
  path: file,
});

describe("PackStore", () => {
  it("loads the Bundled Pack at start as read-only and prepared", async () => {
    const { store, patches } = await stage();
    await store.start([]);
    const bundled = store.state().bundled!;
    expect(bundled).toMatchObject({
      name: "Bundled",
      readOnly: true,
      status: "ok",
      folder: bundledDir,
      ffmpeg: true,
    });
    expect(bundled.prepared.total).toBeGreaterThan(0);
    expect(bundled.prepared).toEqual({
      done: bundled.prepared.total,
      total: bundled.prepared.total,
    });
    expect(
      Object.values(bundled.entries).every(
        (entry) => entry.status === "ok" && entry.hasThumbnail,
      ),
    ).toBe(true);
    expect(patches.map((patch) => patch.path.join("/"))).toEqual([
      "packs/bundled",
      "packs/bundled",
    ]);
    expect((patches[0] as { value: { status: string } }).value.status).toBe(
      "loading",
    );
    await store.idle();
    expect(store.state().bundled?.prepared).toEqual(bundled.prepared);
  });

  it("adds a folder: manifest, Registry, live state, bakes, and the hint beside the Installation", async () => {
    const { store, registry, neon, show, patches, dir } = await stage();
    await store.start([]);
    store.follow(source({}, show));
    const added = await addPack(store, neon);
    if (!added.ok) throw new Error(added.error);
    expect(added.result).toEqual({
      packId: "neon-ssss",
      name: "Neon",
      relativePath: "media/Neon",
    });
    expect(registry.get("neon-ssss")).toEqual({ folder: neon, name: "Neon" });
    expect(
      JSON.parse(
        await readFile(path.join(dir, "config", "packs.json"), "utf8"),
      ),
    ).toMatchObject({ packs: { "neon-ssss": { name: "Neon" } } });
    const live = store.state()["neon-ssss"]!;
    expect(live).toMatchObject({
      status: "ok",
      readOnly: false,
      folder: neon,
      prepared: { done: 0, total: 2 },
    });
    expect(Object.keys(live.entries)).toEqual(["b", "loops-a"]);
    await store.idle();
    const baked = store.state()["neon-ssss"]!;
    expect(baked.prepared).toEqual({ done: 2, total: 2 });
    expect(baked.entries["loops-a"]).toMatchObject({
      hasThumbnail: true,
      proxies: [BASE_PROXY_HEIGHT],
      width: 64,
      height: 36,
      duration: 2,
    });
    expect(baked.entries.b).toMatchObject({
      hasThumbnail: true,
      proxies: [],
      width: 64,
    });
    // Baking travels as the entry's own properties and the count, never the whole Pack again.
    const neonPatches = patches.filter(
      (patch) => patch.path[1] === "neon-ssss",
    );
    expect(neonPatches[0]?.path).toEqual(["packs", "neon-ssss"]);
    expect(neonPatches.slice(1).every((patch) => patch.path.length >= 3)).toBe(
      true,
    );
    expect(
      neonPatches.some(
        (patch) =>
          patch.path.join("/") === "packs/neon-ssss/entries/loops-a/proxies",
      ),
    ).toBe(true);
    expect(
      neonPatches.some(
        (patch) => patch.path.join("/") === "packs/neon-ssss/prepared",
      ),
    ).toBe(true);
    // Measurements were written to the manifest.
    const manifest = JSON.parse(
      await readFile(path.join(neon, ".difracta", "pack.json"), "utf8"),
    ) as { entries: { id: string; width?: number }[] };
    expect(
      manifest.entries.find((entry) => entry.id === "loops-a")?.width,
    ).toBe(64);
    // The folder sat beside the Installation; a Pack elsewhere gets no hint.
    store.follow(source({}, path.join(dir, "elsewhere", "deep", "x.difracta")));
    const other = path.join(dir, "other");
    await writeTree(other, { "z.png": "z" });
    const far = await addPack(store, other);
    expect(far.ok && far.result.relativePath).toBeUndefined();
  });

  it("follows the Installation: Registry first, then the hint when the ids match, else missing; detaching unloads", async () => {
    const { store, registry, neon, show, patches } = await stage({
      tools: false,
    });
    await store.start([]);
    const loaded = await loadPackFolder(neon, {
      cacheRoot: "/unused",
      random: () => 0.5,
    });
    if (!loaded.ok) throw new Error(loaded.error);
    const id = loaded.pack.manifest.id;
    // Not known, no hint: missing.
    store.follow(source({ [id]: { id, name: "Neon copy" } }, show));
    await store.idle();
    expect(store.state()[id]).toMatchObject({
      status: "missing",
      name: "Neon copy",
      folder: "",
      ffmpeg: false,
      entries: {},
    });
    // A hint to a folder holding another Pack is refused.
    const wrong = path.join(path.dirname(show), "media", "Wrong");
    await writeTree(wrong, { "w.png": "w" });
    await writeManifest(path.join(wrong, ".difracta"), {
      version: 1,
      id: "wrong-aaaa",
      name: "Wrong",
      entries: [],
    });
    store.follow(
      source(
        { [id]: { id, name: "Neon copy", relativePath: "media/Wrong" } },
        show,
      ),
    );
    await store.idle();
    expect(store.state()[id]?.status).toBe("missing");
    // The right hint loads it, named by its manifest.
    store.follow(
      source(
        { [id]: { id, name: "Neon copy", relativePath: "media/Neon" } },
        show,
      ),
    );
    await store.idle();
    expect(store.state()[id]).toMatchObject({
      status: "ok",
      name: "Neon",
      folder: neon,
    });
    expect(Object.keys(store.state()[id]!.entries)).toEqual(["b", "loops-a"]);
    // Detached: gone from the live state, as one removal.
    store.follow(source({}, show));
    expect(store.state()[id]).toBeUndefined();
    expect(patches.at(-1)).toEqual({ op: "remove", path: ["packs", id] });
    // The Registry wins over a stale hint.
    await registry.set(id, { folder: neon, name: "Neon" });
    store.follow(
      source(
        { [id]: { id, name: "Neon copy", relativePath: "nowhere" } },
        show,
      ),
    );
    await store.idle();
    expect(store.state()[id]?.status).toBe("ok");
    // Located later, a missing Pack loads.
    store.follow(
      source({ "late-zzzz": { id: "late-zzzz", name: "Late" } }, show),
    );
    await store.idle();
    expect(store.state()["late-zzzz"]?.status).toBe("missing");
    const late = path.join(path.dirname(show), "late");
    await writeTree(late, { "l.png": "l" });
    await writeManifest(path.join(late, ".difracta"), {
      version: 1,
      id: "late-zzzz",
      name: "Late",
      entries: [],
    });
    const located = await locatePack(store, "late-zzzz", late);
    expect(located).toEqual({
      ok: true,
      result: { packId: "late-zzzz", name: "Late" },
    });
    expect(store.state()["late-zzzz"]).toMatchObject({
      status: "ok",
      folder: late,
    });
    expect(Object.keys(store.state()["late-zzzz"]!.entries)).toEqual(["l"]);
    expect((await locatePack(store, "late-zzzz", neon)).ok).toBe(false);
  });

  it("edits metadata as per-property patches and refuses every write on a read-only Pack", async () => {
    const { store, neon, show, patches, runner } = await stage();
    await store.start([]);
    store.follow(source({}, show));
    const added = await addPack(store, neon);
    if (!added.ok) throw new Error(added.error);
    await store.idle();
    const id = added.result.packId;
    patches.length = 0;
    const updated = await updatePackEntry(store, id, "loops-a", {
      tags: [" Loop", "hit", "loop", ""],
      beats: 16,
      name: "Alpha",
    });
    expect(updated.ok).toBe(true);
    expect(patches).toEqual([
      {
        op: "set",
        path: ["packs", id, "entries", "loops-a", "name"],
        value: "Alpha",
      },
      {
        op: "set",
        path: ["packs", id, "entries", "loops-a", "tags"],
        value: ["Loop", "hit"],
      },
      {
        op: "set",
        path: ["packs", id, "entries", "loops-a", "beats"],
        value: 16,
      },
    ]);
    expect(
      await updatePackEntry(store, id, "loops-a", { firstBeat: 0.5 }),
    ).toMatchObject({ ok: true });
    expect(
      await updatePackEntry(store, id, "loops-a", { beats: null }),
    ).toMatchObject({ ok: true });
    expect(store.state()[id]?.entries["loops-a"]).not.toHaveProperty("beats");
    expect(store.state()[id]?.entries["loops-a"]).not.toHaveProperty(
      "firstBeat",
    );
    expect((await updatePackEntry(store, id, "nope", { name: "x" })).ok).toBe(
      false,
    );
    // A new thumbnail time drops the thumbnail until it is baked again.
    patches.length = 0;
    const calls = runner.calls.length;
    expect(
      (await updatePackEntry(store, id, "loops-a", { thumbnailAt: 1.25 })).ok,
    ).toBe(true);
    expect(patches.map((patch) => patch.path.slice(2).join("/"))).toEqual([
      "prepared",
      "entries/loops-a/hasThumbnail",
      "entries/loops-a/thumbnailAt",
    ]);
    await store.idle();
    expect(store.state()[id]?.entries["loops-a"]?.hasThumbnail).toBe(true);
    expect(
      runner.calls.slice(calls).map((call) => call.args.slice(0, 3)),
    ).toEqual([["-y", "-ss", "1.25"]]);
    const manifest = JSON.parse(
      await readFile(path.join(neon, ".difracta", "pack.json"), "utf8"),
    ) as { entries: { id: string; thumbnailAt?: number; name: string }[] };
    expect(
      manifest.entries.find((entry) => entry.id === "loops-a"),
    ).toMatchObject({ name: "Alpha", thumbnailAt: 1.25 });
    // Renaming reaches the manifest and the Registry.
    expect(await renamePackEverywhere(store, id, "Neon VJ")).toEqual({
      ok: true,
      result: { packId: id, name: "Neon VJ" },
    });
    expect(store.state()[id]?.name).toBe("Neon VJ");
    expect(store.known()).toEqual([
      { id, name: "Neon VJ", folder: neon, loaded: true },
    ]);
    // Read-only.
    for (const refused of [
      await renamePackEverywhere(store, "bundled", "Mine"),
      await updatePackEntry(
        store,
        "bundled",
        Object.keys(store.state().bundled!.entries)[0]!,
        { tags: ["x"] },
      ),
      await addPack(store, bundledDir),
      await locatePack(store, "bundled", bundledDir),
    ]) {
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.error).toMatch(/Bundled Pack/);
    }
    expect((await rescanPack(store, "bundled")).ok).toBe(true);
    expect((await rescanPack(store, "none-aaaa")).ok).toBe(false);
  });

  it("rescans a loaded Pack: a renamed file keeps its entry, a new one is added, a gone one reads missing", async () => {
    const { store, neon, show } = await stage({ tools: false });
    await store.start([]);
    store.follow(source({}, show));
    const added = await addPack(store, neon);
    if (!added.ok) throw new Error(added.error);
    const id = added.result.packId;
    const { rename, rm } = await import("node:fs/promises");
    await rename(
      path.join(neon, "loops", "a.mp4"),
      path.join(neon, "loops", "alpha.mp4"),
    );
    await rm(path.join(neon, "b.png"));
    await writeTree(neon, { "c.webm": "cccc" });
    expect(await rescanPack(store, id)).toEqual({
      ok: true,
      result: { packId: id },
    });
    const live = store.state()[id]!;
    expect(live.entries["loops-a"]).toMatchObject({
      file: "loops/alpha.mp4",
      status: "ok",
    });
    expect(live.entries.b?.status).toBe("missing");
    expect(live.entries.c).toMatchObject({ file: "c.webm", status: "ok" });
    expect(live.prepared).toEqual({ done: 0, total: 2 });
    expect(live.ffmpeg).toBe(false);
  });

  it("loads --pack folders for the run, known to the Registry without writing it", async () => {
    const { store, registry, neon, show, dir } = await stage({ tools: false });
    await store.start([neon]);
    const id = store.known()[0]!.id;
    expect(store.known()).toEqual([
      { id, name: "Neon", folder: neon, loaded: true },
    ]);
    expect(store.state()[id]?.status).toBe("ok");
    await expect(
      readFile(path.join(dir, "config", "packs.json")),
    ).rejects.toThrow();
    // Not attached, it stays loaded.
    store.follow(source({}, show));
    expect(store.state()[id]?.status).toBe("ok");
    expect(registry.get(id)?.folder).toBe(neon);
  });
});
