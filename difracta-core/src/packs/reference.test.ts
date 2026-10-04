import { describe, expect, it } from "vitest";

import {
  isMediaReference,
  mediaReference,
  parseMediaReference,
} from "./reference.ts";

describe("Media references", () => {
  it("are <packId>/<entryId>, one slash, slugs on both sides", () => {
    expect(parseMediaReference("neon-k7f3/tunnels-04")).toEqual({
      packId: "neon-k7f3",
      entryId: "tunnels-04",
    });
    expect(mediaReference("bundled", "beam-scan-loop")).toBe(
      "bundled/beam-scan-loop",
    );
    expect(isMediaReference("")).toBe(false);
    expect(isMediaReference("share_abc")).toBe(false);
    expect(isMediaReference("a/b/c")).toBe(false);
    expect(isMediaReference("/b")).toBe(false);
    expect(isMediaReference("a/")).toBe(false);
    expect(isMediaReference("A/b")).toBe(false);
    expect(isMediaReference(42)).toBe(false);
  });
});
