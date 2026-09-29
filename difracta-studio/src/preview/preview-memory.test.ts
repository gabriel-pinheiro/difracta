import { describe, expect, it } from "vitest";

import { isRemembered, remember } from "./preview-memory";

const isNumber = (candidate: unknown): candidate is number =>
  typeof candidate === "number";

describe("remember", () => {
  it("adds an entry as the newest and replaces one it already had", () => {
    expect(Object.entries(remember({ a: 1, b: 2 }, "a", 3, 8))).toEqual([
      ["b", 2],
      ["a", 3],
    ]);
  });

  it("drops the oldest beyond the limit", () => {
    expect(remember({ a: 1, b: 2 }, "c", 3, 2)).toEqual({ b: 2, c: 3 });
  });
});

describe("isRemembered", () => {
  it("accepts a record of accepted values only", () => {
    const accept = isRemembered(isNumber);
    expect(accept({ a: 1 })).toBe(true);
    expect(accept({})).toBe(true);
    expect(accept({ a: "1" })).toBe(false);
    expect(accept([1])).toBe(false);
    expect(accept(null)).toBe(false);
  });
});
