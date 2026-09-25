import { describe, expect, it } from "vitest";

import { storedMediaPath } from "./media-path";

describe("storedMediaPath", () => {
  it("relativizes a picked file against the Installation file's folder", () => {
    expect(
      storedMediaPath(
        "/shows/living/art/logo.png",
        "/shows/living/tonight.difracta",
      ),
    ).toBe("art/logo.png");
    expect(
      storedMediaPath("/media/clip.mp4", "/shows/living/tonight.difracta"),
    ).toBe("../../media/clip.mp4");
  });

  it("keeps a typed relative path, and an absolute one while the Installation has no file", () => {
    expect(
      storedMediaPath("art/logo.png", "/shows/living/tonight.difracta"),
    ).toBe("art/logo.png");
    expect(storedMediaPath("/shows/living/art/logo.png", null)).toBe(
      "/shows/living/art/logo.png",
    );
    expect(storedMediaPath("C:\\Shows\\a.png", null)).toBe("C:/Shows/a.png");
  });
});
