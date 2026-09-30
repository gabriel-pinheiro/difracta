import { describe, expect, it } from "vitest";

import { hostName } from "./host-name.ts";

describe("This computer's name in a runtime", () => {
  it("is its hostname, trimmed and cut to what the protocol takes", () => {
    expect(hostName(" stage-pc \n")).toBe("stage-pc");
    expect(hostName("x".repeat(200))).toHaveLength(120);
  });

  it("is Desktop's own when the computer has none", () => {
    expect(hostName("")).toBe("Difracta Desktop");
    expect(hostName("   ")).toBe("Difracta Desktop");
  });
});
