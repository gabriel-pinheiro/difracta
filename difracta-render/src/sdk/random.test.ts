import { describe, expect, it } from "vitest";

import { createRandom, seedFromText } from "./random.ts";

describe("random", () => {
  it("replays the same sequence for the same seed, whether a number or a text", () => {
    const a = createRandom("layer_1");
    const b = createRandom(seedFromText("layer_1"));
    const c = createRandom("layer_2");
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect([c(), c(), c()]).not.toEqual(first);
    expect(first.every((value) => value >= 0 && value < 1)).toBe(true);
  });

  it("offers ranges, picks and signs", () => {
    const random = createRandom(7);
    for (let i = 0; i < 100; i += 1) {
      const value = random.between(2, 5);
      expect(value).toBeGreaterThanOrEqual(2);
      expect(value).toBeLessThan(5);
      expect(["a", "b"]).toContain(random.pick(["a", "b"]));
      expect([1, -1]).toContain(random.sign());
    }
    expect(() => random.pick([])).toThrow("Nothing to pick from.");
  });
});
