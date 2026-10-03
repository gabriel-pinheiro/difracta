import { createFilterPlayer, type ShaderFilter } from "@difracta/render/sdk";
import { describe, expect, it } from "vitest";

import { adjust } from "./adjust.ts";
import { colorKey } from "./color-key.ts";
import { colorize } from "./colorize.ts";
import { crop } from "./crop.ts";
import { edgeFade } from "./edge-fade.ts";
import { hueOf, hueShift } from "./hue-shift.ts";
import { invert } from "./invert.ts";
import { kaleido } from "./kaleido.ts";
import { mirror } from "./mirror.ts";
import { threshold } from "./threshold.ts";
import { transform } from "./transform.ts";

const DT = 1 / 60;

function player(filter: ShaderFilter) {
  const instance = createFilterPlayer(filter, {
    width: 960,
    height: 540,
    seed: "test",
  });
  return (values: Record<string, unknown>, dt = DT) =>
    instance.frame(dt, values as never, 960, 540);
}

/** The Filters a Visual Layer's picture is treated with: colour, then geometry. */
const treatments = [
  colorize,
  hueShift,
  colorKey,
  adjust,
  invert,
  threshold,
  mirror,
  kaleido,
  crop,
  transform,
  edgeFade,
];

/** The colour Filters read straight alpha and return premultiplied. */
const colour = [colorize, hueShift, colorKey, adjust, invert, threshold];

describe("every treatment Filter", () => {
  it.each(treatments.map((filter) => ({ filter })))(
    "$filter.id defines filter_image, has notes and declares what it reads",
    ({ filter }) => {
      expect(filter.fragment).toContain("vec4 filter_image(vec2 uv)");
      expect(filter.notes?.length ?? 0).toBeGreaterThan(200);
      expect(filter.notes).toMatch(/Visual Layer/);
      // Hue Shift reads its colours in the instance and hands the shader one turn.
      if (filter.id !== "hue-shift")
        for (const name of Object.keys(filter.parameters))
          expect(filter.fragment).toContain(`u_${name}`);
      // Whatever the instance hands the shader, the fragment declares.
      const result = player(filter)({});
      for (const name of Object.keys(result.uniforms))
        expect(filter.fragment).toContain(`uniform float u_${name};`);
    },
  );

  it.each(colour.map((filter) => ({ filter })))(
    "$filter.id works in straight alpha",
    ({ filter }) => {
      expect(filter.fragment).toContain("sample_straight(uv)");
      expect(filter.fragment).toContain("premultiply(");
    },
  );

  it.each([
    { filter: colorize, off: { amount: 0 }, on: {} },
    {
      filter: hueShift,
      off: { from: [1, 0, 0, 1], to: [1, 0, 0, 1] },
      on: {},
    },
    // Adjust, Crop and Transform start neutral: on is a value moved.
    {
      filter: adjust,
      off: { brightness: 0, contrast: 1, saturation: 1, gamma: 1 },
      on: { gamma: 1.2 },
    },
    {
      filter: crop,
      off: { left: 0, top: 0, right: 0, bottom: 0 },
      on: { right: 0.1 },
    },
    {
      filter: transform,
      off: {
        offsetX: 0,
        offsetY: 0,
        scale: 1,
        rotation: 0,
        flipHorizontal: false,
        flipVertical: false,
      },
      on: { flipVertical: true },
    },
    { filter: edgeFade, off: { width: 0 }, on: {} },
  ])(
    "$filter.id passes through at its neutral values and not away from them",
    ({ filter, off, on }) => {
      const frame = player(filter);
      expect(frame(off).identity).toBe(true);
      expect(frame(on).identity).toBe(false);
    },
  );

  it("Adjust and Transform leave identity whichever value moves", () => {
    expect(player(adjust)({ saturation: 0 }).identity).toBe(false);
    expect(player(adjust)({ brightness: -0.1 }).identity).toBe(false);
    expect(player(transform)({ rotation: 90 }).identity).toBe(false);
    expect(player(transform)({ scale: 1.5 }).identity).toBe(false);
  });

  // Like Dither, these always do something: Mix is how they are eased off.
  it.each([colorKey, invert, threshold, mirror, kaleido].map((f) => ({ f })))(
    "$f.id never reports identity",
    ({ f }) => {
      expect("create" in f).toBe(false);
      expect(player(f)({}).identity).toBe(false);
    },
  );
});

describe("Hue Shift", () => {
  it("measures hue as a turn, with none for a grey", () => {
    expect(hueOf([1, 0, 0, 1])).toBe(0);
    expect(hueOf([0, 1, 0, 1])).toBeCloseTo(1 / 3, 6);
    expect(hueOf([0, 0, 1, 1])).toBeCloseTo(2 / 3, 6);
    expect(hueOf([1, 0, 1, 1])).toBeCloseTo(5 / 6, 6);
    expect(hueOf([0.5, 0.5, 0.5, 1])).toBeUndefined();
    expect(hueOf([0, 0, 0, 1])).toBeUndefined();
  });

  it("shifts by the turn from From to To, and is identity when either has no hue", () => {
    const frame = player(hueShift);
    const red = [1, 0, 0, 1];
    const toGreen = frame({ from: red, to: [0, 1, 0, 1] });
    expect(toGreen.uniforms.shift).toBeCloseTo(1 / 3, 6);
    expect(toGreen.identity).toBe(false);
    // Going the other way round the wheel is the short way written long.
    expect(frame({ from: [0, 1, 0, 1], to: red }).uniforms.shift).toBeCloseTo(
      2 / 3,
      6,
    );
    expect(frame({ from: red, to: [0.4, 0.4, 0.4, 1] }).identity).toBe(true);
    expect(frame({ from: [1, 1, 1, 1], to: red }).identity).toBe(true);
    // A still Scene under a still shift costs nothing after the first frame.
    frame({ from: red, to: [0, 1, 0, 1] });
    expect(frame({ from: red, to: [0, 1, 0, 1] }).changed).toBe(false);
  });
});

describe("choice Filters", () => {
  it("pin the order of their options, which the fragments read by index", () => {
    expect(mirror.parameters.axis.options.map((o) => o.value)).toEqual([
      "horizontal",
      "vertical",
      "both",
    ]);
    expect(mirror.parameters.keep.options.map((o) => o.value)).toEqual([
      "first",
      "second",
    ]);
    expect(edgeFade.parameters.shape.options.map((o) => o.value)).toEqual([
      "rectangle",
      "oval",
    ]);
    expect(mirror.fragment).toContain("u_keep == 0");
    expect(edgeFade.fragment).toContain("u_shape == 0");
  });
});
