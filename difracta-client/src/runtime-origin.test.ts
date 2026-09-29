import { describe, expect, it } from "vitest";

import { runtimeOrigin } from "./runtime-origin.ts";

describe("runtimeOrigin", () => {
  it("is the page's origin without a runtime parameter", () => {
    expect(runtimeOrigin(null, "http://tv.local:4801")).toBe(
      "http://tv.local:4801",
    );
  });

  it("turns the live socket URL into the runtime's HTTP origin", () => {
    expect(runtimeOrigin("ws://stage:4800/live", "http://tv.local:4801")).toBe(
      "http://stage:4800",
    );
    expect(runtimeOrigin("wss://stage/live", "http://tv.local:4801")).toBe(
      "https://stage",
    );
  });

  it("falls back to the page's origin for a URL it cannot read", () => {
    expect(runtimeOrigin("::nope", "http://tv.local:4801")).toBe(
      "http://tv.local:4801",
    );
  });
});
