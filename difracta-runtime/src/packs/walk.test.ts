import { afterEach, describe, expect, it } from "vitest";

import { tempDir, writeTree } from "./fixtures.ts";
import { walkPackFolder } from "./walk.ts";

let done: (() => Promise<void>) | undefined;
afterEach(async () => {
  await done?.();
});

describe("walkPackFolder", () => {
  it("finds images and videos in path order, skipping dot folders, dot files and other files", async () => {
    const temp = await tempDir();
    done = temp.done;
    await writeTree(temp.dir, {
      "b.mp4": "b",
      "a/zed.png": "z",
      "a/.hidden.png": "h",
      ".difracta/thumbs/x.webp": "x",
      ".git/clip.mp4": "g",
      "a/notes.txt": "n",
      "A-upper/1.webm": "1",
    });
    expect(await walkPackFolder(temp.dir)).toEqual({
      files: ["A-upper/1.webm", "a/zed.png", "b.mp4"],
    });
  });

  it("stops at the depth and count limits with a warning naming them", async () => {
    const temp = await tempDir();
    done = temp.done;
    await writeTree(temp.dir, {
      "1/2/3/deep.png": "d",
      "1/shallow.png": "s",
      "a.png": "a",
      "b.png": "b",
      "c.png": "c",
    });
    const deep = await walkPackFolder(temp.dir, { maxDepth: 2 });
    expect(deep.files).toEqual(["1/shallow.png", "a.png", "b.png", "c.png"]);
    expect(deep.warning).toContain("more than 2 levels deep");
    const many = await walkPackFolder(temp.dir, { maxMedia: 2 });
    expect(many.files).toEqual(["1/2/3/deep.png", "1/shallow.png"]);
    expect(many.warning).toContain("first 2 by path");
  });
});
