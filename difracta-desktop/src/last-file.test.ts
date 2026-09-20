import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LastFileStore } from "./last-file.ts";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "difracta-desktop-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("last file store", () => {
  it("has nothing on first launch", async () => {
    expect(await new LastFileStore(dir).read()).toBeUndefined();
  });

  it("remembers the newest file across instances, creating its folder", async () => {
    const userData = path.join(dir, "not-yet", "there");
    const store = new LastFileStore(userData);
    await store.write("/shows/a.difracta");
    await store.write("/shows/b.difracta");
    expect(await new LastFileStore(userData).read()).toBe("/shows/b.difracta");
  });

  it("reads a damaged state file as nothing", async () => {
    const file = path.join(dir, "desktop-state.json");
    await writeFile(file, "{ not json");
    expect(await new LastFileStore(dir).read()).toBeUndefined();
    await writeFile(file, JSON.stringify({ lastFile: 7 }));
    expect(await new LastFileStore(dir).read()).toBeUndefined();
  });
});
