import { describe, expect, it } from "vitest";

import {
  cssColor,
  fit,
  rateTimer,
  smooth,
  smoothstep,
  ticker,
} from "./helpers.ts";
import { createRandom } from "./random.ts";

describe("fit", () => {
  it("grows and shrinks at the end, leaving the rest alone", () => {
    const list = [10, 11, 12];
    fit(list, 5, (index) => index * 100);
    expect(list).toEqual([10, 11, 12, 300, 400]);
    fit(list, 2, () => -1);
    expect(list).toEqual([10, 11]);
    fit(list, 2.4, () => -1);
    expect(list).toEqual([10, 11]);
  });
});

describe("smooth", () => {
  it("approaches the target at a rate independent of the frame length", () => {
    let coarse = 0;
    coarse = smooth(coarse, 1, 0.5, 4);
    let fine = 0;
    for (let i = 0; i < 50; i += 1) fine = smooth(fine, 1, 0.01, 4);
    expect(coarse).toBeCloseTo(fine, 6);
    expect(coarse).toBeCloseTo(1 - Math.exp(-2), 6);
  });
});

describe("cssColor", () => {
  it("writes rgba with 0 to 255 channels, alpha replaceable", () => {
    expect(cssColor([1, 0.5, 0, 1])).toBe("rgba(255, 128, 0, 1)");
    expect(cssColor([1, 0.5, 0, 1], 0.25)).toBe("rgba(255, 128, 0, 0.25)");
    expect(cssColor([2, -1, 0, 3])).toBe("rgba(255, 0, 0, 1)");
  });
});

describe("rateTimer", () => {
  it("fires about `rate` times per second and never at rate zero", () => {
    const timer = rateTimer(createRandom(3));
    let fired = 0;
    for (let i = 0; i < 60 * 100; i += 1) fired += timer.advance(1 / 60, 2);
    expect(fired).toBeGreaterThan(180);
    expect(fired).toBeLessThan(220);
    for (let i = 0; i < 600; i += 1) expect(timer.advance(1 / 60, 0)).toBe(0);
  });

  it("carries its progress across a rate change instead of restarting", () => {
    const timer = rateTimer(createRandom(1));
    // Almost due at rate 1, then a jump to rate 10 fires within a frame or two.
    let fired = 0;
    for (let i = 0; i < 30; i += 1) fired += timer.advance(1 / 60, 1);
    expect(fired).toBe(0);
    let frames = 0;
    while (fired === 0 && frames < 10) {
      fired += timer.advance(1 / 60, 10);
      frames += 1;
    }
    expect(fired).toBeGreaterThan(0);
  });
});

describe("smoothstep", () => {
  it("clamps outside the edges and eases between them", () => {
    expect(smoothstep(0.2, 0.8, 0)).toBe(0);
    expect(smoothstep(0.2, 0.8, 1)).toBe(1);
    expect(smoothstep(0.2, 0.8, 0.5)).toBeCloseTo(0.5, 6);
    expect(smoothstep(0, 1, 0.25)).toBeCloseTo(0.15625, 6);
  });
});

describe("ticker", () => {
  it("fires regularly at the rate and keeps its progress across rate changes", () => {
    const clock = ticker();
    let fired = 0;
    for (let i = 0; i < 4; i += 1) fired += clock.advance(0.125, 4);
    expect(fired).toBe(2);
    expect(clock.phase).toBeCloseTo(0, 6);
    expect(clock.advance(0.1, 4)).toBe(0);
    expect(clock.phase).toBeCloseTo(0.4, 6);
    // Slowing down keeps the 40% already elapsed.
    expect(clock.advance(0.6, 1)).toBe(1);
    expect(clock.phase).toBeCloseTo(0, 6);
    expect(clock.advance(1, 0)).toBe(0);
    expect(clock.advance(0.5, 2.5)).toBe(1);
    expect(clock.phase).toBeCloseTo(0.25, 6);
  });
});
