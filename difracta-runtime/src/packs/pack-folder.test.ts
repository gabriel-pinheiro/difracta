import { chmod, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { tempDir, writeTree } from "./fixtures.ts";
import { fingerprintFile } from "./fingerprint.ts";
import {
  loadPackFolder,
  readManifest,
  resolveDataDir,
  writeManifest,
} from "./pack-folder.ts";

let done: (() => Promise<void>) | undefined;
afterEach(async () => {
  await done?.();
});

const random = () => 0.25;

describe("loadPackFolder", () => {
  it("creates the manifest in .difracta on first load and updates it without touching metadata", async () => {
    const temp = await tempDir();
    done = temp.done;
    const pack = path.join(temp.dir, "Neon");
    await writeTree(pack, { "loops/a.mp4": "aaaa", "stills/b.png": "bbbb" });
    const first = await loadPackFolder(pack, {
      cacheRoot: path.join(temp.dir, "cache"),
      random,
    });
    if (!first.ok) throw new Error(first.error);
    expect(first.pack.dataDir).toBe(path.join(pack, ".difracta"));
    expect(first.pack.readOnly).toBe(false);
    expect(first.pack.manifest.entries.map((entry) => entry.id)).toEqual([
      "loops-a",
      "stills-b",
    ]);
    expect(first.pack.manifest.entries[0]?.fingerprint).toBe(
      await fingerprintFile(path.join(pack, "loops", "a.mp4")),
    );
    const written = await readManifest(path.join(pack, ".difracta"));
    expect(written?.ok === true && written.manifest.id).toBe(
      first.pack.manifest.id,
    );

    // Metadata edited by hand, a file renamed, one removed, one added.
    const edited = {
      ...first.pack.manifest,
      entries: first.pack.manifest.entries.map((entry) =>
        entry.id === "loops-a"
          ? { ...entry, name: "Alpha", tags: ["Loop"], beats: 8 }
          : entry,
      ),
    };
    await writeManifest(path.join(pack, ".difracta"), edited);
    await rename(
      path.join(pack, "loops", "a.mp4"),
      path.join(pack, "loops", "alpha.mp4"),
    );
    await rm(path.join(pack, "stills", "b.png"));
    await writeTree(pack, { "c.webm": "cccc" });
    const second = await loadPackFolder(pack, {
      cacheRoot: path.join(temp.dir, "cache"),
      random,
    });
    if (!second.ok) throw new Error(second.error);
    expect(second.pack.manifest.id).toBe(first.pack.manifest.id);
    expect(
      second.pack.manifest.entries.find((entry) => entry.id === "loops-a"),
    ).toMatchObject({
      file: "loops/alpha.mp4",
      name: "Alpha",
      tags: ["Loop"],
      beats: 8,
    });
    expect(second.pack.manifest.entries.map((entry) => entry.id)).toEqual([
      "loops-a",
      "stills-b",
      "c",
    ]);
    expect([...second.pack.missing]).toEqual(["stills-b"]);
    const onDisk = JSON.parse(
      await readFile(path.join(pack, ".difracta", "pack.json"), "utf8"),
    ) as { entries: { id: string }[] };
    expect(onDisk.entries.map((entry) => entry.id)).toEqual([
      "loops-a",
      "stills-b",
      "c",
    ]);
  });

  it("refuses a folder holding another Pack when an id is expected, and finds its manifest in the cache", async () => {
    const temp = await tempDir();
    done = temp.done;
    const pack = path.join(temp.dir, "neon");
    await writeTree(pack, { "a.png": "a" });
    const cacheRoot = path.join(temp.dir, "cache");
    const first = await loadPackFolder(pack, { cacheRoot, random });
    if (!first.ok) throw new Error(first.error);
    const other = await loadPackFolder(pack, {
      cacheRoot,
      random,
      expectedId: "other-zzzz",
    });
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.error).toContain(`not “other-zzzz”`);
    expect(
      (
        await loadPackFolder(pack, {
          cacheRoot,
          random,
          expectedId: first.pack.manifest.id,
        })
      ).ok,
    ).toBe(true);
  });

  it("keeps a read-only Pack's data where it ships and never writes it", async () => {
    const temp = await tempDir();
    done = temp.done;
    const pack = path.join(temp.dir, "bundled");
    await writeTree(pack, { "clips/a.mp4": "aaaa" });
    const fingerprint = await fingerprintFile(
      path.join(pack, "clips", "a.mp4"),
    );
    await writeManifest(path.join(pack, ".difracta"), {
      version: 1,
      id: "bundled",
      name: "Bundled",
      readOnly: true,
      entries: [
        {
          id: "a",
          file: "clips/a.mp4",
          type: "video",
          name: "A",
          tags: ["loop"],
          fingerprint,
          width: 1,
          height: 1,
        },
      ],
    });
    await writeTree(path.join(pack, ".difracta"), {
      [`thumbs/${fingerprint}.webp`]: "t",
      [`proxies/${fingerprint}.mp4`]: "p",
    });
    const before = (await stat(path.join(pack, ".difracta", "pack.json")))
      .mtimeMs;
    await writeTree(pack, { "clips/new.mp4": "nnnn" });
    const loaded = await loadPackFolder(pack, {
      cacheRoot: path.join(temp.dir, "cache"),
      random,
    });
    if (!loaded.ok) throw new Error(loaded.error);
    expect(loaded.pack.readOnly).toBe(true);
    expect(loaded.pack.manifest.entries.map((entry) => entry.id)).toEqual([
      "a",
      "clips-new",
    ]);
    expect(loaded.pack.thumbnails.has(fingerprint)).toBe(true);
    expect(loaded.pack.proxies.has(fingerprint)).toBe(true);
    expect(
      (await stat(path.join(pack, ".difracta", "pack.json"))).mtimeMs,
    ).toBe(before);
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "uses the cache when the Pack's folder cannot be written",
    async () => {
      const temp = await tempDir();
      done = temp.done;
      const pack = path.join(temp.dir, "stick");
      await writeTree(pack, { "a.png": "a" });
      await chmod(pack, 0o555);
      try {
        const cacheRoot = path.join(temp.dir, "cache");
        expect(await resolveDataDir(pack, "stick-abcd", cacheRoot)).toBe(
          path.join(cacheRoot, "stick-abcd"),
        );
        const loaded = await loadPackFolder(pack, { cacheRoot, random });
        if (!loaded.ok) throw new Error(loaded.error);
        expect(loaded.pack.readOnly).toBe(false);
        expect(loaded.pack.dataDir).toBe(
          path.join(cacheRoot, loaded.pack.manifest.id),
        );
        const cached = await readManifest(loaded.pack.dataDir);
        expect(cached?.ok).toBe(true);
        // Known by id, the cached manifest is found again.
        const again = await loadPackFolder(pack, {
          cacheRoot,
          random,
          expectedId: loaded.pack.manifest.id,
        });
        expect(again.ok && again.pack.manifest.id).toBe(
          loaded.pack.manifest.id,
        );
      } finally {
        await chmod(pack, 0o755);
      }
    },
  );
});
