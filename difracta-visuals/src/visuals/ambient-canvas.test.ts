import {
  createRandom,
  createShaderPlayer,
  recordingContext,
  resolveParameters,
  type CanvasVisual,
  type RecordedCall,
  type UpdateResult,
} from "@difracta/render/sdk";
import { describe, expect, it } from "vitest";

import { confetti } from "./confetti.ts";
import { glyphRain } from "./glyph-rain.ts";
import { graph } from "./graph.ts";
import { lissajous } from "./lissajous.ts";
import { rain } from "./rain.ts";
import { repeatingShapes } from "./repeating-shapes.ts";
import { snowDrift } from "./snow-drift.ts";

const WIDTH = 320;
const HEIGHT = 180;
const DT = 1 / 60;

type Place = readonly [number, number];

/** Steps a canvas Visual directly and reads back where it drew. */
function harness(visual: CanvasVisual, start: Record<string, unknown> = {}) {
  const recording = recordingContext();
  let params = resolveParameters(visual.parameters, start as never);
  let fresh = true;
  const instance = visual.create({
    width: WIDTH,
    height: HEIGHT,
    params,
    paths: {},
    random: createRandom("test"),
  });
  const step = (
    frames: number,
    values: Record<string, unknown> = {},
    dt = DT,
  ): UpdateResult => {
    params = resolveParameters(visual.parameters, {
      ...params,
      ...values,
    } as never);
    const edited = Object.keys(values).length > 0;
    let report: UpdateResult = {};
    for (let index = 0; index < frames; index += 1) {
      report =
        instance.update({
          dt,
          params,
          paths: {},
          width: WIDTH,
          height: HEIGHT,
          changed: index === 0 && (edited || fresh),
        }) ?? {};
      fresh = false;
    }
    return report;
  };
  const draw = (): readonly RecordedCall[] => {
    recording.clear();
    instance.render({
      context: recording.context,
      width: WIDTH,
      height: HEIGHT,
      params,
      paths: {},
    });
    return recording.calls;
  };
  const positions = (method: string, at = 0): readonly Place[] =>
    draw()
      .filter((call) => call.method === method)
      .map((call): Place => [Number(call.args[at]), Number(call.args[at + 1])]);
  return { step, draw, positions };
}

const CANVAS = [
  {
    name: "Confetti",
    visual: confetti,
    method: "translate",
    at: 0,
    start: {},
    invisible: {
      colorA: [0, 0, 0, 0],
      colorB: [0, 0, 0, 0],
      colorC: [0, 0, 0, 0],
    },
  },
  {
    name: "Glyph Rain",
    visual: glyphRain,
    method: "fillText",
    at: 1,
    start: {},
    invisible: { color: [0, 0, 0, 0], head: [0, 0, 0, 0] },
  },
  {
    name: "Graph",
    visual: graph,
    method: "arc",
    at: 0,
    start: {},
    invisible: { color: [0, 0, 0, 0] },
  },
  {
    name: "Lissajous",
    visual: lissajous,
    method: "lineTo",
    at: 0,
    start: {},
    invisible: { color: [0, 0, 0, 0] },
  },
  {
    name: "Rain",
    visual: rain,
    method: "moveTo",
    at: 0,
    start: { splash: false },
    invisible: { color: [0, 0, 0, 0] },
  },
  {
    name: "Snow Drift",
    visual: snowDrift,
    method: "arc",
    at: 0,
    start: {},
    invisible: { color: [0, 0, 0, 0] },
  },
] as const;

describe.each(CANVAS)("$name", ({ visual, method, at, start, invisible }) => {
  it("integrates its clock, so a Speed change alone moves nothing", () => {
    const { step, positions } = harness(visual, start);
    step(30, { speed: 1 });
    const before = positions(method, at);
    expect(before.length).toBeGreaterThan(0);
    // A Parameter edit with no time passing: a sampling Visual would jump.
    step(1, { speed: 3 }, 0);
    expect(positions(method, at)).toEqual(before);
    // And time at the new Speed does carry it on.
    step(10, { speed: 3 });
    expect(positions(method, at)).not.toEqual(before);
  });

  it("reports no change while Speed is zero", () => {
    const { step } = harness(visual, start);
    expect(step(1, { speed: 0 }).changed).not.toBe(false);
    step(4);
    expect(step(1).changed).toBe(false);
    // A Parameter edit still has to be drawn.
    expect(step(1, { speed: 0.5 }).changed).not.toBe(false);
  });

  it("reports blank when nothing it draws is visible", () => {
    const { step } = harness(visual, start);
    expect(step(1).blank).not.toBe(true);
    expect(step(1, invisible).blank).toBe(true);
  });
});

describe("Glyph Rain", () => {
  it("offers its charsets in a fixed order and draws only from the one picked", () => {
    expect(
      glyphRain.parameters.charset.options.map((one) => one.value),
    ).toEqual(["katakana", "digits", "latin", "katakana-digits"]);
    const { step, draw } = harness(glyphRain, { charset: "digits" });
    step(30);
    const drawn = draw()
      .filter((call) => call.method === "fillText")
      .map((call) => String(call.args[0]));
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn.every((glyph) => /^[0-9]$/.test(glyph))).toBe(true);
  });

  it("mixes katakana and digits on the combined charset", () => {
    const { step, draw } = harness(glyphRain, { charset: "katakana-digits" });
    step(30);
    const drawn = draw()
      .filter((call) => call.method === "fillText")
      .map((call) => String(call.args[0]));
    expect(drawn.some((glyph) => /^[0-9]$/.test(glyph))).toBe(true);
    expect(drawn.some((glyph) => /^[゠-ヿ]$/.test(glyph))).toBe(true);
  });

  it("keeps the glyph cell in pixels and derives the columns from it", () => {
    expect(glyphRain.parameters.size.unit).toBe("px");
    const { step, positions } = harness(glyphRain, { size: 32 });
    step(60);
    const columns = new Set(positions("fillText", 1).map(([x]) => x));
    expect(columns.size).toBeLessThanOrEqual(Math.floor(WIDTH / 32));
  });
});

describe("Rain", () => {
  it("draws splashes only while Splash is on", () => {
    const wet = harness(rain, { splash: true });
    wet.step(120);
    expect(wet.draw().some((call) => call.method === "ellipse")).toBe(true);
    const dry = harness(rain, { splash: false });
    dry.step(120);
    expect(dry.draw().some((call) => call.method === "ellipse")).toBe(false);
    // With no splash every drop is still a streak, so none go missing.
    expect(dry.positions("moveTo").length).toBe(160);
  });
});

describe("Graph", () => {
  it("measures Link Distance as a share of the shorter side", () => {
    expect(graph.parameters.linkDistance.percent).toBe(true);
    expect(graph.parameters.linkDistance.min).toBeGreaterThan(0);
    expect(graph.parameters.linkDistance.max).toBeLessThanOrEqual(1);
    const near = harness(graph, { linkDistance: 0.05, speed: 0 });
    near.step(1);
    const far = harness(graph, { linkDistance: 0.4, speed: 0 });
    far.step(1);
    const links = (calls: readonly RecordedCall[]): number =>
      calls.filter((call) => call.method === "quadraticCurveTo").length;
    expect(links(far.draw())).toBeGreaterThan(links(near.draw()));
  });
});

describe("Lissajous", () => {
  it("keeps Line Width in pixels and Phase in turns, and Size scales the figure", () => {
    expect(lissajous.parameters.lineWidth.unit).toBe("px");
    expect(lissajous.parameters.phase.unit).toBe("turns");
    expect(lissajous.parameters.size.percent).toBe(true);
    const extent = (size: number): number => {
      const { step, positions } = harness(lissajous, { size, speed: 0 });
      step(1);
      const xs = positions("lineTo").map(([x]) => x);
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(extent(0.5)).toBeGreaterThan(extent(0.2));
  });
});

describe("Repeating Shapes", () => {
  const frame = () => {
    const player = createShaderPlayer(repeatingShapes, {
      width: WIDTH,
      height: HEIGHT,
      seed: "test",
    });
    return (values: Record<string, unknown> = {}, dt = DT) =>
      player.frame(dt, values as never, WIDTH, HEIGHT);
  };

  it("is a shader that tiles Surface Space and keeps Tile Size in pixels", () => {
    expect(repeatingShapes.backend).toBe("shader");
    expect(repeatingShapes.fragment).toContain("vec4 render_visual(vec2 uv)");
    expect(repeatingShapes.fragment).toContain("u_resolution");
    expect(repeatingShapes.parameters.tileSize.unit).toBe("px");
    expect(repeatingShapes.parameters.speed.label).toBe("Speed");
    expect(
      repeatingShapes.parameters.shapes.options.map((one) => one.value),
    ).toEqual(["all", "circles", "bars", "triangles"]);
  });

  it("integrates its phase, rests at Speed zero and goes blank when nothing is opaque", () => {
    const step = frame();
    const started = step({ speed: 1 }).uniforms.time as number;
    const moved = step({ speed: 1 });
    expect(moved.changed).toBe(true);
    expect((moved.uniforms.time as number) - started).toBeCloseTo(DT, 6);
    // A Speed edit with no time passing leaves the phase exactly where it was.
    const held = (moved.uniforms.time as number) + 0;
    expect(step({ speed: 3 }, 0).uniforms.time).toBeCloseTo(held, 10);
    expect(step({ speed: 3 }).uniforms.time).toBeCloseTo(held + DT * 3, 6);

    step({ speed: 0 });
    expect(step({ speed: 0 }).changed).toBe(false);
    expect(step({ speed: 0, tileSize: 100 }).changed).toBe(true);
    expect(
      step({
        speed: 0,
        background: [0, 0, 0, 0],
        colorA: [0, 0, 0, 0],
        colorB: [0, 0, 0, 0],
      }).blank,
    ).toBe(true);
  });
});
