import { describe, expect, it } from "vitest";

import { reportedShares, sharesWarning } from "./share-leaving.ts";

describe("Leaving while sharing", () => {
  it("counts what the page says, and nothing it should not say", () => {
    expect(reportedShares(2)).toBe(2);
    expect(reportedShares(0)).toBe(0);
    for (const said of [-1, 1.5, Number.NaN, "2", null, undefined, {}])
      expect(reportedShares(said), JSON.stringify(said)).toBe(0);
    expect(reportedShares(1_000_000)).toBe(64);
  });

  it("warns that quitting stops the share", () => {
    expect(sharesWarning(1, "quit")).toEqual({
      message: "This computer is sharing its screen into 1 Screen Share.",
      detail: "Quitting stops it.",
      confirm: "Quit",
    });
  });

  it("warns that switching stops the shares", () => {
    expect(sharesWarning(3, "switch")).toEqual({
      message: "This computer is sharing its screen into 3 Screen Shares.",
      detail: "Switching stops them.",
      confirm: "Switch",
    });
  });
});
