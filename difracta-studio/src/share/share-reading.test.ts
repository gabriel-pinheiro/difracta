import { describe, expect, it } from "vitest";

import { readingProblem } from "./share-reading";

describe("readingProblem", () => {
  it("says nothing when the Screen Shares read, whatever else did not", () => {
    expect(readingProblem(undefined)).toBeNull();
    expect(
      readingProblem({
        unreadable: [{ part: "surfaces", issue: "mappings: invalid" }],
      }),
    ).toBeNull();
  });

  it("names the Screen Shares when they did not read", () => {
    expect(
      readingProblem({
        unreadable: [{ part: "live/shares", issue: "status: invalid" }],
      }),
    ).toContain("Screen Shares (live/shares: status: invalid)");
  });

  it("says why when the Installation did not read at all", () => {
    expect(
      readingProblem({ unreadable: [], failure: "installation: missing" }),
    ).toContain(
      "could not read the runtime's Installation (installation: missing)",
    );
  });
});
