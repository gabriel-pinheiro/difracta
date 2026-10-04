import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { tempDir } from "./fixtures.ts";
import { packsCacheDir, registryFile, userConfigDir } from "./platform-dirs.ts";
import { PackRegistry } from "./registry.ts";

let done: (() => Promise<void>) | undefined;
afterEach(async () => {
  await done?.();
});

describe("platform folders", () => {
  it("follow each platform's convention and the overriding variables", () => {
    expect(userConfigDir({}, "linux", "/home/g")).toBe("/home/g/.config");
    expect(userConfigDir({ XDG_CONFIG_HOME: "/xdg" }, "linux", "/home/g")).toBe(
      "/xdg",
    );
    expect(userConfigDir({}, "darwin", "/Users/g")).toBe(
      "/Users/g/Library/Application Support",
    );
    expect(
      userConfigDir(
        { APPDATA: "C:\\Users\\g\\AppData\\Roaming" },
        "win32",
        "C:\\Users\\g",
      ),
    ).toBe("C:\\Users\\g\\AppData\\Roaming");
    expect(registryFile({}, "linux", "/home/g")).toBe(
      "/home/g/.config/difracta/packs.json",
    );
    expect(
      registryFile({ DIFRACTA_PACKS_FILE: "/tmp/p.json" }, "linux", "/home/g"),
    ).toBe("/tmp/p.json");
    expect(packsCacheDir({}, "linux", "/home/g")).toBe(
      "/home/g/.cache/difracta/packs",
    );
    expect(
      packsCacheDir({ DIFRACTA_CACHE_DIR: "/c" }, "linux", "/home/g"),
    ).toBe("/c");
    expect(packsCacheDir({}, "darwin", "/Users/g")).toBe(
      "/Users/g/Library/Caches/difracta/packs",
    );
  });
});

describe("PackRegistry", () => {
  it("starts empty without a file, writes what it is told and reads it back", async () => {
    const temp = await tempDir();
    done = temp.done;
    const file = path.join(temp.dir, "config", "packs.json");
    const registry = new PackRegistry(file);
    await registry.load();
    expect(registry.list()).toEqual([]);
    await registry.set("neon-k7f3", { folder: "/media/neon", name: "Neon" });
    await registry.set("bundled", { folder: "/x", name: "Bundled" });
    registry.setTransient("run-aaaa", { folder: "/run", name: "Run" });
    expect(registry.list()).toEqual([
      { id: "neon-k7f3", folder: "/media/neon", name: "Neon" },
      { id: "run-aaaa", folder: "/run", name: "Run" },
    ]);
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
      version: 1,
      packs: { "neon-k7f3": { folder: "/media/neon", name: "Neon" } },
    });
    const again = new PackRegistry(file);
    await again.load();
    expect(again.get("neon-k7f3")).toEqual({
      folder: "/media/neon",
      name: "Neon",
    });
    expect(again.get("run-aaaa")).toBeUndefined();
  });

  it("ignores a file that is not a Registry, saying so", async () => {
    const temp = await tempDir();
    done = temp.done;
    const file = path.join(temp.dir, "packs.json");
    await (await import("node:fs/promises")).writeFile(file, '{"packs": 1}');
    const logged: string[] = [];
    const registry = new PackRegistry(file, (message) => logged.push(message));
    await registry.load();
    expect(registry.list()).toEqual([]);
    expect(logged[0]).toContain("not a Pack Registry");
  });
});
