import { describe, expect, it } from "vitest";

import {
  clampCount,
  columnAt,
  columnMoving,
  columnPlace,
  digitsOf,
  moveCount,
  sendColumn,
  settleColumn,
  stepColumn,
} from "./counter-count.ts";

const stop = { min: 0, max: 9, atLimit: "stop" } as const;
const wrap = { min: 0, max: 9, atLimit: "wrap" } as const;

describe("the count", () => {
  it("stops at the limit it would pass", () => {
    expect(moveCount(8, 1, stop)).toBe(9);
    expect(moveCount(9, 1, stop)).toBe(9);
    expect(moveCount(1, -5, stop)).toBe(0);
  });

  it("wraps to the other limit, the step after Maximum being Minimum", () => {
    expect(moveCount(9, 1, wrap)).toBe(0);
    expect(moveCount(0, -1, wrap)).toBe(9);
    expect(moveCount(8, 5, wrap)).toBe(3);
    expect(moveCount(3, 1, { min: 3, max: 5, atLimit: "wrap" })).toBe(4);
    expect(moveCount(5, 1, { min: 3, max: 5, atLimit: "wrap" })).toBe(3);
    expect(moveCount(-2, -1, { min: -2, max: 2, atLimit: "wrap" })).toBe(2);
  });

  it("takes the limits in either order", () => {
    expect(clampCount(20, { min: 9, max: 0, atLimit: "stop" })).toBe(9);
    expect(clampCount(-3, { min: 9, max: 0, atLimit: "stop" })).toBe(0);
  });

  it("reads its digits ones first, padded and capped", () => {
    expect(digitsOf(507, 1, 12)).toEqual([7, 0, 5]);
    expect(digitsOf(7, 3, 12)).toEqual([7, 0, 0]);
    expect(digitsOf(-42, 1, 12)).toEqual([2, 4]);
    expect(digitsOf(0, 1, 12)).toEqual([0]);
    expect(digitsOf(123456, 1, 4)).toEqual([6, 5, 4, 3]);
  });
});

describe("a column", () => {
  it("eases to the next digit over the time given, then rests on it", () => {
    const column = columnAt(3);
    sendColumn(column, 4, 1);
    expect(columnMoving(column)).toBe(true);
    expect(columnPlace(column)).toBe(3);
    stepColumn(column, 0.1, 0.2);
    expect(columnPlace(column)).toBeCloseTo(3.5);
    stepColumn(column, 0.1, 0.2);
    expect(columnPlace(column)).toBe(4);
    expect(columnMoving(column)).toBe(false);
  });

  it("goes on past 9 to 0 on the way up and back past 0 to 9 on the way down", () => {
    const up = columnAt(9);
    sendColumn(up, 0, 1);
    stepColumn(up, 0.1, 0.2);
    expect(columnPlace(up)).toBeCloseTo(9.5);
    stepColumn(up, 0.1, 0.2);
    expect(columnPlace(up)).toBe(0);
    const down = columnAt(0);
    sendColumn(down, 9, -1);
    stepColumn(down, 0.1, 0.2);
    expect(columnPlace(down)).toBeCloseTo(9.5);
    stepColumn(down, 0.1, 0.2);
    expect(columnPlace(down)).toBe(9);
  });

  it("spins through every digit sent while it moves, from where it is", () => {
    const column = columnAt(0);
    const seen: number[] = [];
    for (let digit = 1; digit <= 10; digit += 1) {
      sendColumn(column, digit % 10, 1);
      stepColumn(column, 0.01, 0.2);
      seen.push(columnPlace(column));
    }
    // Still on its way, never having jumped back.
    expect(columnMoving(column)).toBe(true);
    for (let index = 1; index < seen.length; index += 1)
      expect(seen[index]).toBeGreaterThan(seen[index - 1] ?? 0);
    for (let step = 0; step < 30; step += 1) stepColumn(column, 0.01, 0.2);
    expect(columnPlace(column)).toBe(0);
    expect(columnMoving(column)).toBe(false);
  });

  it("stays put when sent to the digit it shows", () => {
    const column = columnAt(5);
    sendColumn(column, 5, 1);
    expect(columnMoving(column)).toBe(false);
  });

  it("settles at once when told to", () => {
    const column = columnAt(2);
    sendColumn(column, 7, -1);
    settleColumn(column);
    expect(columnPlace(column)).toBe(7);
    expect(columnMoving(column)).toBe(false);
  });
});
