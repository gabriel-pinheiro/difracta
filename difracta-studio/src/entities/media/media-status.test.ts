import type { Media, Table } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { mediaWarning, mediaWarningCount } from "./media-status";

const media = {
  a: { id: "a", name: "a", path: "a.png", order: "a" },
  b: { id: "b", name: "b", path: "b.png", order: "b" },
  c: { id: "c", name: "c", path: "c.mp4", order: "c" },
} as unknown as Table<Media>;

describe("Media status", () => {
  it("warns for every status but ok, and not before the runtime reports one", () => {
    expect(mediaWarning(undefined)).toBeUndefined();
    expect(mediaWarning({ status: "ok" })).toBeUndefined();
    expect(mediaWarning({ status: "missing" })?.label).toBe("Missing");
    expect(mediaWarning({ status: "outside" })?.explanation).toContain(
      "--media-anywhere",
    );
    expect(mediaWarning({ status: "unsaved" })?.explanation).toContain(
      "Save the Installation",
    );
  });

  it("counts the rows that warn for the collapsed section", () => {
    expect(
      mediaWarningCount(media, {
        a: { status: "ok" },
        b: { status: "missing" },
      }),
    ).toBe(1);
    expect(mediaWarningCount({}, {})).toBe(0);
  });
});
