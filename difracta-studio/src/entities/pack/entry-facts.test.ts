import { describe, expect, it } from "vitest";

import { entryFacts } from "./entry-facts";

describe("An entry's facts line", () => {
  it("reads size, length and beats with the tempo", () => {
    expect(
      entryFacts({ width: 1920, height: 1080, duration: 7.1, beats: 16 }),
    ).toBe("1920×1080, 7.1 s, 16 beats, 135.2 BPM");
  });

  it("leaves out what is not known", () => {
    expect(entryFacts({ width: 640, height: 480 })).toBe("640×480");
    expect(entryFacts({ duration: 12.345 })).toBe("12.3 s");
    expect(entryFacts({ beats: 8 })).toBe("8 beats");
    expect(entryFacts({})).toBe("");
  });
});
