import { describe, expect, it } from "vitest";

import {
  isAbsoluteMediaPath,
  mediaExtension,
  mediaKindOf,
  mediaNameOf,
  installationFolder,
  mediaPathProblem,
  normalizeMediaPath,
  relativeMediaPath,
  resolveMediaPath,
  withinFolder,
} from "./media.ts";

describe("Media kinds", () => {
  it("reads the kind from the extension, whatever its case", () => {
    expect(mediaExtension("art/Logo.PNG")).toBe("png");
    expect(mediaExtension("noext")).toBeUndefined();
    expect(mediaExtension(".hidden")).toBeUndefined();
    expect(mediaExtension("trailing.")).toBeUndefined();
    expect(mediaKindOf("Logo.PNG")).toBe("image");
    expect(mediaKindOf("clips/loop.webm")).toBe("video");
    expect(mediaKindOf("clip.MOV")).toBe("video");
    expect(mediaKindOf("notes.txt")).toBeUndefined();
    expect(mediaKindOf("noext")).toBeUndefined();
  });

  it("names an item after its file and refuses what it cannot show", () => {
    expect(mediaNameOf("art/My Logo.png")).toBe("My Logo");
    expect(mediaNameOf("noext")).toBe("noext");
    expect(mediaPathProblem("art/logo.png")).toBeUndefined();
    expect(mediaPathProblem("notes.txt")).toContain("not an image or video");
    expect(mediaPathProblem("notes.txt")).toContain("png, jpg");
    expect(mediaPathProblem("notes.txt")).toContain("or mov");
    expect(mediaPathProblem("")).toContain("must name a file");
    expect(mediaPathProblem("art/")).toContain("not an image or video");
  });
});

describe("Media paths", () => {
  it("normalizes separators and dot segments without node:path", () => {
    expect(normalizeMediaPath("art\\logo.png")).toBe("art/logo.png");
    expect(normalizeMediaPath("./art//./logo.png")).toBe("art/logo.png");
    expect(normalizeMediaPath("art/../logo.png")).toBe("logo.png");
    expect(normalizeMediaPath("../../shared/logo.png")).toBe(
      "../../shared/logo.png",
    );
    expect(normalizeMediaPath("a/../../b")).toBe("../b");
    expect(normalizeMediaPath("")).toBe(".");
    expect(normalizeMediaPath("/shows/a/../b/")).toBe("/shows/b");
    expect(normalizeMediaPath("/../x")).toBe("/x");
    expect(normalizeMediaPath("C:\\Shows\\..\\x.png")).toBe("C:/x.png");
    expect(isAbsoluteMediaPath("/shows")).toBe(true);
    expect(isAbsoluteMediaPath("D:\\shows")).toBe(true);
    expect(isAbsoluteMediaPath("shows")).toBe(false);
  });

  it("relativizes an absolute path against the Installation's folder", () => {
    expect(
      relativeMediaPath("/shows/living/art/logo.png", "/shows/living"),
    ).toBe("art/logo.png");
    expect(relativeMediaPath("/shows/living/logo.png", "/shows/living/")).toBe(
      "logo.png",
    );
    expect(relativeMediaPath("/shows/shared/logo.png", "/shows/living")).toBe(
      "../shared/logo.png",
    );
    expect(relativeMediaPath("/media/x.mp4", "/shows/living/sub")).toBe(
      "../../../media/x.mp4",
    );
    expect(relativeMediaPath("/shows/living", "/shows/living")).toBe(".");
    expect(
      relativeMediaPath("C:\\Shows\\Living\\a.png", "C:/Shows/Living"),
    ).toBe("a.png");
    // Another drive: nothing relative reaches it.
    expect(relativeMediaPath("D:/media/a.png", "C:/Shows/Living")).toBe(
      "D:/media/a.png",
    );
    // A relative path is already relative.
    expect(relativeMediaPath("art/logo.png", "/shows/living")).toBe(
      "art/logo.png",
    );
  });

  it("finds the folder an Installation file's Media paths are relative to", () => {
    expect(installationFolder("/shows/living/tonight.difracta")).toBe(
      "/shows/living",
    );
    expect(installationFolder("/tonight.difracta")).toBe("/");
    expect(installationFolder("C:\\Shows\\Living\\tonight.difracta")).toBe(
      "C:/Shows/Living",
    );
    expect(installationFolder("tonight.difracta")).toBe(".");
    expect(
      relativeMediaPath(
        "/shows/living/art/logo.png",
        installationFolder("/shows/living/tonight.difracta"),
      ),
    ).toBe("art/logo.png");
  });

  it("resolves a stored path and says whether it stays under the folder", () => {
    expect(resolveMediaPath("/shows/living", "art/logo.png")).toBe(
      "/shows/living/art/logo.png",
    );
    expect(resolveMediaPath("/shows/living", "../shared/x.png")).toBe(
      "/shows/shared/x.png",
    );
    expect(resolveMediaPath("/shows/living", "/abs/x.png")).toBe("/abs/x.png");
    expect(withinFolder("/shows/living", "/shows/living/art/logo.png")).toBe(
      true,
    );
    expect(withinFolder("/shows/living/", "/shows/living/logo.png")).toBe(true);
    expect(withinFolder("/shows/living", "/shows/shared/x.png")).toBe(false);
    expect(withinFolder("/shows/living", "/shows/living-2/x.png")).toBe(false);
    expect(withinFolder("/shows/living", "/shows/living")).toBe(false);
  });
});
