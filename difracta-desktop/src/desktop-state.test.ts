import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DesktopStateStore } from "./desktop-state.ts";

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
});
