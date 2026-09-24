import { describe, expect, it } from "vitest";

import {
  documentFolder,
  relativizeMediaPayload,
  storedMediaPath,
} from "./media-paths.ts";

const saved = { path: "/shows/living/living.difracta" };
const unsaved = { path: null };

describe("Media paths at the shell", () => {
  it("stores a typed path relative to the Installation's folder", () => {
    expect(documentFolder(saved)).toBe("/shows/living");
    expect(storedMediaPath(saved, "art/logo.png", "/shows/living")).toBe(
      "art/logo.png",
    );
    expect(storedMediaPath(saved, "./logo.png", "/shows/living/art")).toBe(
      "art/logo.png",
    );
    expect(storedMediaPath(saved, "/media/loop.mp4", "/anywhere")).toBe(
      "../../media/loop.mp4",
    );
    expect(storedMediaPath(saved, "loop.mp4", "/home/me")).toBe(
      "../../home/me/loop.mp4",
    );
  });

  it("refuses when the Installation has no file", () => {
    expect(() => documentFolder(unsaved)).toThrow("Save it first");
    expect(() => storedMediaPath(unsaved, "x.png")).toThrow("no file yet");
  });

  it("relativizes the path of media.create and media.path payloads only", () => {
    expect(
      relativizeMediaPayload(
        saved,
        "media.create",
        { path: "logo.png", name: "Logo" },
        "/shows/living/art",
      ),
    ).toEqual({ path: "art/logo.png", name: "Logo" });
    expect(
      relativizeMediaPayload(
        saved,
        "media.path",
        { mediaId: "m", path: "../x.mp4" },
        "/shows/living",
      ),
    ).toEqual({ mediaId: "m", path: "../x.mp4" });
    expect(
      relativizeMediaPayload(saved, "media.rename", { path: "x" }, "/"),
    ).toEqual({ path: "x" });
    expect(relativizeMediaPayload(saved, "media.create", {}, "/")).toEqual({});
    expect(() =>
      relativizeMediaPayload(unsaved, "media.create", { path: "x.png" }, "/"),
    ).toThrow("no file yet");
  });
});
