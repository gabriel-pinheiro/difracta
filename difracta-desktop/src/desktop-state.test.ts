import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { settings } from "@difracta/core";

import {
  DesktopStateStore,
  withDisplayMapping,
  withLastMode,
} from "./desktop-state.ts";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "difracta-desktop-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("desktop state store", () => {
  it("has nothing on first launch", async () => {
    expect(await new DesktopStateStore(dir).read()).toEqual({ remembered: [] });
  });

  it("keeps each change across instances, creating its folder", async () => {
    const userData = path.join(dir, "not-yet", "there");
    const store = new DesktopStateStore(userData);
    // Not awaited one by one: changes made together must all land.
    await Promise.all([
      store.update((state) => ({ ...state, lastFile: "/shows/a.difracta" })),
      store.update((state) => ({ ...state, lastMode: { kind: "local" } })),
      store.update((state) => ({ ...state, lastFile: "/shows/b.difracta" })),
    ]);
    expect(await new DesktopStateStore(userData).read()).toEqual({
      lastFile: "/shows/b.difracta",
      lastMode: { kind: "local" },
      remembered: [],
    });
  });

  it("reads a state file from before modes were remembered", async () => {
    await writeFile(
      path.join(dir, "desktop-state.json"),
      JSON.stringify({ lastFile: "/shows/a.difracta" }),
    );
    expect(await new DesktopStateStore(dir).read()).toEqual({
      lastFile: "/shows/a.difracta",
      remembered: [],
    });
  });

  it("reads a damaged state file as nothing", async () => {
    const file = path.join(dir, "desktop-state.json");
    await writeFile(file, "{ not json");
    expect(await new DesktopStateStore(dir).read()).toEqual({ remembered: [] });
    await writeFile(file, JSON.stringify({ lastFile: 7 }));
    expect(await new DesktopStateStore(dir).read()).toEqual({ remembered: [] });
    await writeFile(
      file,
      JSON.stringify({ lastMode: { kind: "remote", origin: "" } }),
    );
    expect(await new DesktopStateStore(dir).read()).toEqual({ remembered: [] });
  });

  it("keeps whether local mode starts without the Studio window", async () => {
    const store = new DesktopStateStore(dir);
    await store.update((state) => ({ ...state, startWithoutStudio: true }));
    expect(await new DesktopStateStore(dir).read()).toEqual({
      remembered: [],
      startWithoutStudio: true,
    });
  });

  it("notes the mode to resume, and remembers a runtime elsewhere", () => {
    const stage = {
      origin: "http://10.0.0.5:4800",
      name: "Difracta on stage-pc",
    };
    const before = { remembered: [], startWithoutStudio: true };
    expect(withLastMode(before, { kind: "local" })).toEqual({
      ...before,
      lastMode: { kind: "local" },
    });
    expect(withLastMode(before, { kind: "remote", ...stage })).toEqual({
      ...before,
      lastMode: { kind: "remote", ...stage },
      remembered: [stage],
    });
  });

  it("keeps which Display showed which Output per Installation, the one placed last longest", async () => {
    const display = {
      label: "EPSON PJ",
      internal: false,
      bounds: { x: 1920, y: 0, width: 1920, height: 1080 },
    };
    const store = new DesktopStateStore(dir);
    await store.update((state) =>
      withDisplayMapping(state, "show-a", [{ output: "wall", display }]),
    );
    expect(await new DesktopStateStore(dir).read()).toEqual({
      remembered: [],
      displayMappings: { "show-a": [{ output: "wall", display }] },
    });

    let state = await store.read();
    for (let i = 0; i < settings.desktop.displayMappingsLimit; i += 1)
      state = withDisplayMapping(state, `show-${String(i)}`, [
        { output: "wall", display },
      ]);
    expect(Object.keys(state.displayMappings ?? {})).not.toContain("show-a");
    // Placed again, an Installation is the newest; with nothing placed, forgotten.
    state = withDisplayMapping(state, "show-0", [{ output: "floor", display }]);
    expect(Object.keys(state.displayMappings ?? {}).at(-1)).toBe("show-0");
    state = withDisplayMapping(state, "show-0", []);
    expect(Object.keys(state.displayMappings ?? {})).not.toContain("show-0");
    expect(
      withDisplayMapping(
        withDisplayMapping({ remembered: [] }, "only", [
          { output: "wall", display },
        ]),
        "only",
        [],
      ),
    ).toEqual({ remembered: [] });
  });
});
