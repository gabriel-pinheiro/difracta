import {
  createShaderPlayer,
  createVisualPlayer,
  recordingContext,
  type PathShape,
  type ShaderVisual,
} from "@difracta/render/sdk";
import type { ParameterSchema } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { frameEmbers } from "./frame-embers.ts";
import { frameGarland } from "./frame-garland.ts";
import { frameIvy } from "./frame-ivy.ts";
import { frameMarquee } from "./frame-marquee.ts";
import { frameNeon } from "./frame-neon.ts";
import { frameOrbit } from "./frame-orbit.ts";
import { frameStripes } from "./frame-stripes.ts";
import { pathHalo } from "./path-halo.ts";
import { pathRibbons } from "./path-ribbons.ts";

const WIDTH = 320;
const HEIGHT = 180;
const DT = 1 / 60;

/** A closed frame and the same corner opened, so every Visual meets both. */
const closedPath: PathShape = {
  points: [
    { x: 0.2, y: 0.2 },
    { x: 0.8, y: 0.2 },
    { x: 0.8, y: 0.8 },
    { x: 0.2, y: 0.8 },
  ],
  closed: true,
};
const openPath: PathShape = { ...closedPath, closed: false };

function shader(visual: ShaderVisual, key = "frame") {
  const player = createShaderPlayer(visual, {
    width: WIDTH,
    height: HEIGHT,
    seed: "test",
  });
  return {
    cue: (cueKey: string) => player.cue(cueKey),
    frame: (
      values: Record<string, unknown> = {},
      path: PathShape = closedPath,
    ) => player.frame(DT, values as never, WIDTH, HEIGHT, { [key]: path }),
  };
}

const SHADERS = [
  { visual: frameMarquee, key: "frame", still: { speed: 0 } },
  { visual: frameStripes, key: "frame", still: { speed: 0 } },
  { visual: frameOrbit, key: "frame", still: { speed: 0 } },
  { visual: frameNeon, key: "frame", still: { speed: 0, flicker: 0 } },
  { visual: frameEmbers, key: "frame", still: { speed: 0, drift: 0 } },
  { visual: pathHalo, key: "frame", still: { speed: 0 } },
  { visual: pathRibbons, key: "path", still: { speed: 0 } },
];

describe("Path shader Visuals", () => {
  it.each(SHADERS)(
    "$visual.id declares its fragment, its Path and no clashing uniform",
    ({ visual, key }) => {
      expect(visual.fragment).toContain("vec4 render_visual(vec2 uv)");
      expect(visual.paths?.map((path) => path.key)).toEqual([key]);
      expect(visual.notes).toBeTruthy();
      // A uniform the instance sets must never share a name with a Parameter,
      // or the two declarations collide when the program compiles.
      const declared = [
        ...visual.fragment.matchAll(/uniform \w+ u_(\w+);/g),
      ].map((match) => match[1]!);
      const parameters: ParameterSchema = visual.parameters;
      for (const name of declared) expect(parameters[name]).toBeUndefined();
    },
  );

  it.each(SHADERS)(
    "$visual.id draws on an open Path as well as a closed one",
    ({ visual, key, still }) => {
      const { frame } = shader(visual, key);
      // An open Path is a Path like any other: it draws, and held still it
      // repeats, so the Layer costs nothing to recomposite.
      expect(frame(still, openPath).blank).toBe(false);
      expect(frame(still, openPath).changed).toBe(false);
      // Closing it is a Path edit, so the frame must be recomposited.
      expect(frame(still, closedPath).changed).toBe(true);
      expect(frame(still, closedPath).blank).toBe(false);
    },
  );
});

describe("Frame Marquee", () => {
  it("chases both ways from one integrated phase and rests at Speed zero", () => {
    const { frame } = shader(frameMarquee);
    frame({ speed: 1 });
    expect(frame({ speed: 1 }).uniforms.time).toBeCloseTo(2 * 0.08 * DT, 6);
    frame({ speed: 0 });
    const still = frame({ speed: 0 });
    expect(still.changed).toBe(false);
    // Reversing carries the phase on rather than jumping.
    const before = still.uniforms.time as number;
    expect(frame({ speed: -1 }).uniforms.time).toBeCloseTo(
      before - 0.08 * DT,
      6,
    );
    // The phase wraps, so it never grows without bound.
    for (let i = 0; i < 600; i += 1) frame({ speed: 4 });
    const wrapped = frame({ speed: 4 }).uniforms.time as number;
    expect(wrapped).toBeGreaterThanOrEqual(0);
    expect(wrapped).toBeLessThan(1);
    // Two transparent colours draw nothing.
    expect(frame({ colorA: [1, 1, 1, 0], colorB: [1, 1, 1, 0] }).blank).toBe(
      true,
    );
  });
});

describe("Frame Stripes", () => {
  it("integrates its rotation and blanks when both colours are transparent", () => {
    const { frame } = shader(frameStripes);
    frame({ speed: 1 });
    expect(frame({ speed: 1 }).uniforms.time).toBeCloseTo(2 * 1.8 * DT, 6);
    frame({ speed: 0 });
    expect(frame({ speed: 0 }).changed).toBe(false);
    expect(frame({ speed: 0, thickness: 40 }).changed).toBe(true);
    expect(frame({ colorA: [1, 1, 1, 0], colorB: [1, 1, 1, 0] }).blank).toBe(
      true,
    );
  });
});

describe("Frame Orbit", () => {
  it("integrates its orbit and rests when the lights hold still", () => {
    const { frame } = shader(frameOrbit);
    frame({ speed: 1 });
    expect(frame({ speed: 1 }).uniforms.time).toBeCloseTo(2 * 0.09 * DT, 6);
    frame({ speed: 0 });
    expect(frame({ speed: 0 }).changed).toBe(false);
    expect(frame({ speed: 0, count: 6 }).changed).toBe(true);
    expect(frame({ frame: [1, 1, 1, 0], orbit: [1, 1, 1, 0] }).blank).toBe(
      true,
    );
  });
});

describe("Frame Neon", () => {
  it("only hums and drops out while Flicker is up, and re-rolls at Flicker Rate", () => {
    const { frame } = shader(frameNeon);
    // Steady tube: no flicker, no pulse, nothing to recomposite.
    frame({ flicker: 0, speed: 0 });
    const still = frame({ flicker: 0, speed: 0 });
    expect(still.changed).toBe(false);
    const heldGate = still.uniforms.gate;
    expect(frame({ flicker: 0, speed: 0 }).uniforms.gate).toBe(heldGate);
    // The dropout gate re-rolls about Flicker Rate times a second.
    const gates = new Set<unknown>();
    for (let i = 0; i < 60; i += 1)
      gates.add(frame({ flicker: 1, flickerRate: 10 }).uniforms.gate);
    expect(gates.size).toBeGreaterThan(5);
    expect(gates.size).toBeLessThan(20);
    // The hum clock wraps at a full turn, so it never grows.
    for (let i = 0; i < 600; i += 1) frame({ flicker: 1 });
    expect(frame({ flicker: 1 }).uniforms.hum).toBeLessThan(Math.PI * 2);
    expect(frame({ tube: [1, 1, 1, 0] }).blank).toBe(true);
  });
});

describe("Frame Embers", () => {
  it("burns on Speed, rises on Drift, and goes out at Intensity zero", () => {
    const { frame } = shader(frameEmbers);
    frame({ speed: 1, drift: 0 });
    expect(frame({ speed: 1, drift: 0 }).uniforms.time).toBeCloseTo(2 * DT, 6);
    // Drift is its own clock, so the sparks rise with Speed at zero.
    frame({ speed: 0, drift: 2 });
    const drifting = frame({ speed: 0, drift: 2 });
    expect(drifting.changed).toBe(true);
    expect(drifting.uniforms.rise).toBeGreaterThan(0);
    frame({ speed: 0, drift: 0 });
    expect(frame({ speed: 0, drift: 0 }).changed).toBe(false);
    // The spark grid scrolls by whole cells, so the offset never grows.
    for (let i = 0; i < 600; i += 1) frame({ speed: 0, drift: 8 });
    const rise = frame({ speed: 0, drift: 8 }).uniforms.rise as number;
    expect(rise).toBeGreaterThanOrEqual(0);
    expect(rise).toBeLessThan(1);
    expect(frame({ intensity: 0 }).blank).toBe(true);
  });
});

describe("Path Halo", () => {
  it("integrates its pulse and blanks when both colours are transparent", () => {
    const { frame } = shader(pathHalo);
    frame({ speed: 1 });
    expect(frame({ speed: 1 }).uniforms.time).toBeCloseTo(2 * 0.6366 * DT, 6);
    frame({ speed: 0 });
    expect(frame({ speed: 0 }).changed).toBe(false);
    expect(frame({ speed: 0, reach: 60 }).changed).toBe(true);
    expect(frame({ halo: [1, 1, 1, 0], pulse: [1, 1, 1, 0] }).blank).toBe(true);
  });
});

describe("Path Ribbons", () => {
  it("weaves in a signed band around the Path and freezes at Speed zero", () => {
    // The fragment needs the side of the Path, or the ribbons collapse in pairs.
    expect(pathRibbons.fragment).toContain("signedDistance");
    expect(pathRibbons.backend).toBe("shader");
    const { frame } = shader(pathRibbons, "path");
    frame({ speed: 1 });
    expect(frame({ speed: 1 }).uniforms.time).toBeCloseTo(2 * 0.4775 * DT, 6);
    frame({ speed: 0 });
    expect(frame({ speed: 0 }).changed).toBe(false);
    expect(frame({ speed: 0, weave: 60 }).changed).toBe(true);
    for (let i = 0; i < 600; i += 1) frame({ speed: 3 });
    const time = frame({ speed: 3 }).uniforms.time as number;
    expect(time).toBeGreaterThanOrEqual(0);
    expect(time).toBeLessThan(1);
    expect(frame({ colorA: [1, 1, 1, 0], colorB: [1, 1, 1, 0] }).blank).toBe(
      true,
    );
  });
});

describe("Frame Garland", () => {
  it("hangs a bulb per anchor, twinkles on its own clock, and rests at zero", () => {
    const recording = recordingContext();
    const player = createVisualPlayer(frameGarland, {
      context: recording.context,
      width: WIDTH,
      height: HEIGHT,
      seed: "test",
    });
    const values = { bulbs: 8, twinkle: 1 };
    expect(player.frame(DT, values, { frame: closedPath })).toEqual({
      rendered: true,
      blank: false,
    });
    // Eight bulbs: a halo arc and a bulb arc and a highlight arc each.
    expect(recording.callsTo("arc")).toHaveLength(24);
    // A closed Path closes the cable: one curve per bulb, one fewer when open.
    expect(recording.callsTo("quadraticCurveTo")).toHaveLength(8);
    recording.clear();
    player.frame(DT, values, { frame: openPath });
    expect(recording.callsTo("quadraticCurveTo")).toHaveLength(7);
    // Held still with no twinkle there is nothing to redraw.
    player.frame(DT, { ...values, twinkle: 0 }, { frame: openPath });
    expect(
      player.frame(DT, { ...values, twinkle: 0 }, { frame: openPath }).rendered,
    ).toBe(false);
    // Every colour transparent draws nothing at all.
    expect(
      player.frame(
        DT,
        {
          ...values,
          colorA: [1, 1, 1, 0],
          colorB: [1, 1, 1, 0],
          cable: [1, 1, 1, 0],
        },
        { frame: openPath },
      ).blank,
    ).toBe(true);
  });
});

describe("Frame Ivy", () => {
  it("starts grown, strips bare on a Growth, and creeps back over eight more", () => {
    const recording = recordingContext();
    const player = createVisualPlayer(frameIvy, {
      context: recording.context,
      width: WIDTH,
      height: HEIGHT,
      seed: "test",
    });
    const values = { leaves: 8, sway: 0, automaticRate: 0 };
    const paths = { frame: closedPath };
    // A fresh Layer is fully grown: one leaf or blossom per anchor.
    expect(player.frame(DT, values, paths)).toEqual({
      rendered: true,
      blank: false,
    });
    const grown = recording.callsTo("translate").length;
    expect(grown).toBe(8);
    // With nothing swaying or growing there is nothing to redraw.
    expect(player.frame(DT, values, paths).rendered).toBe(false);
    // The Growth on a full vine strips it bare, and the Layer draws nothing.
    player.cue("growth");
    expect(player.frame(DT, values, paths).blank).toBe(true);
    // The next one starts the creep; only the leaves it has reached open.
    player.cue("growth");
    for (let i = 0; i < 20; i += 1) player.frame(DT, values, paths);
    recording.clear();
    player.frame(DT, values, paths);
    const creeping = recording.callsTo("translate").length;
    expect(creeping).toBeGreaterThan(0);
    expect(creeping).toBeLessThan(grown);
    // Seven more Growths fill it back up.
    for (let cue = 0; cue < 7; cue += 1) player.cue("growth");
    for (let i = 0; i < 200; i += 1) player.frame(DT, values, paths);
    recording.clear();
    // Settled, it has nothing to redraw, so a Parameter edit asks for one.
    player.frame(DT, { ...values, size: 12 }, paths);
    expect(recording.callsTo("translate")).toHaveLength(grown);
    // Sway keeps redrawing without anything growing.
    player.frame(DT, { ...values, sway: 1 }, paths);
    expect(player.frame(DT, { ...values, sway: 1 }, paths).rendered).toBe(true);
  });

  it("grows along an open Path without joining its ends", () => {
    const recording = recordingContext();
    const player = createVisualPlayer(frameIvy, {
      context: recording.context,
      width: WIDTH,
      height: HEIGHT,
      seed: "test",
    });
    const values = { leaves: 8, sway: 0, automaticRate: 0 };
    player.frame(DT, values, { frame: openPath });
    expect(recording.callsTo("closePath")).toHaveLength(0);
    expect(recording.callsTo("translate")).toHaveLength(8);
    recording.clear();
    player.frame(DT, values, { frame: closedPath });
    expect(recording.callsTo("closePath").length).toBeGreaterThan(0);
  });

  it("creeps by itself on the Automatic Rate", () => {
    const recording = recordingContext();
    const player = createVisualPlayer(frameIvy, {
      context: recording.context,
      width: WIDTH,
      height: HEIGHT,
      seed: "test",
    });
    const paths = { frame: closedPath };
    let stripped = false;
    for (let i = 0; i < 300 && !stripped; i += 1)
      stripped = player.frame(DT, { sway: 0, automaticRate: 4 }, paths).blank;
    expect(stripped).toBe(true);
  });
});
