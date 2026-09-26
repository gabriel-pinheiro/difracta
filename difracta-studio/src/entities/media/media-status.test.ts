import type { Media, Table } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { mediaWarning, mediaWarningCount } from "./media-status";

const file = (id: string, path: string) => ({
  id,
  kind: "file",
  name: id,
  parentId: null,
  path,
  order: id,
});
const media = {
  a: file("a", "a.png"),
  b: file("b", "b.png"),
  c: file("c", "c.mp4"),
  g: { id: "g", kind: "group", name: "g", parentId: null, order: "g" },
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

  it("counts the file rows that warn for the collapsed section, never a Group", () => {
    expect(
      mediaWarningCount(media, {
        a: { status: "ok" },
        b: { status: "missing" },
        g: { status: "missing" },
      }),
    ).toBe(1);
    expect(mediaWarningCount({}, {})).toBe(0);
  });
});
