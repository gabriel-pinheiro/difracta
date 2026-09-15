import { createShaderPlayer, type ShaderVisual } from "@difracta/render/sdk";
import { describe, expect, it } from "vitest";

import { hyperdrive } from "./hyperdrive.ts";
import { LASER_RAIN_DIRECTIONS, laserRain } from "./laser-rain.ts";
import { sirenBeacon } from "./siren-beacon.ts";

const DT = 1 / 60;

/** Visuals held on a pad: enabled on press, so each one starts fresh. */
const HOLDS: readonly ShaderVisual[] = [hyperdrive, sirenBeacon, laserRain];

/** The Parameters that stop each one moving. */
const STILL: Readonly<Record<string, Record<string, unknown>>> = {
  hyperdrive: { speed: 0 },
  "siren-beacon": { speed: 0 },
  "laser-rain": { speed: 0 },
};

function player(visual: ShaderVisual) {
  const instance = createShaderPlayer(visual, {
    width: 320,
    height: 180,
    seed: "test",
  });
  return (values: Record<string, unknown> = {}, dt = DT) =>
    instance.frame(dt, values as never, 320, 180);
}

const uniform = (result: { uniforms: object }, name: string): number =>
  (result.uniforms as Record<string, number>)[name] ?? Number.NaN;

describe("hold Visuals", () => {
  it.each(HOLDS)(
    "$id paints on its very first frame and keeps moving",
    (visual) => {
      expect(visual.fragment).toContain("vec4 render_visual(vec2 uv)");
      const frame = player(visual);
      const first = frame();
      expect(first.blank).toBe(false);
      expect(first.changed).toBe(true);
      expect(frame().changed).toBe(true);
    },
  );

  it.each(HOLDS)("$id costs nothing once stopped", (visual) => {
    const frame = player(visual);
    const still = STILL[visual.id] ?? {};
    frame(still);
    const held = frame(still);
    expect(held.changed).toBe(false);
    expect(held.blank).toBe(false);
  });
});

describe("Hyperdrive", () => {
  /** Travel wraps at 16; the step between two readings, forward. */
  const step = (before: number, after: number): number =>
    (((after - before) % 16) + 16) % 16;

  it("speeds up and stretches the longer it is held, only with Acceleration", () => {
    for (const acceleration of [0, 1]) {
      const frame = player(hyperdrive);
      const values = { speed: 1, acceleration };
      let previous = frame(values);
      const early = frame(values);
      const earlyStep = step(
        uniform(previous, "travel"),
        uniform(early, "travel"),
      );
      for (let i = 0; i < 120; i += 1) previous = frame(values);
      const late = frame(values);
      const lateStep = step(
        uniform(previous, "travel"),
        uniform(late, "travel"),
      );
      if (acceleration === 0) {
        expect(lateStep).toBeCloseTo(earlyStep, 6);
        expect(uniform(late, "stretch")).toBeCloseTo(uniform(early, "stretch"));
      } else {
        expect(lateStep).toBeGreaterThan(earlyStep * 2.5);
        expect(uniform(late, "stretch")).toBeGreaterThan(
          uniform(early, "stretch"),
        );
      }
    }
  });

  it("never boosts past four times Speed", () => {
    const frame = player(hyperdrive);
    const values = { speed: 1, acceleration: 2 };
    let previous = frame(values);
    for (let i = 0; i < 600; i += 1) previous = frame(values);
    const next = frame(values);
    expect(
      step(uniform(previous, "travel"), uniform(next, "travel")),
    ).toBeCloseTo(4 * 0.5 * DT, 6);
  });
});

describe("Siren Beacon", () => {
  it("turns backwards at a negative Rotation Speed", () => {
    const frame = player(sirenBeacon);
    const before = uniform(frame({ speed: -1 }), "rotation");
    const after = uniform(frame({ speed: -1 }), "rotation");
    expect((((after - before) % 1) + 1) % 1).toBeCloseTo(1 - DT, 6);
  });
});

describe("Laser Rain", () => {
  it("keeps its Direction options in the order the fragment reads", () => {
    expect(LASER_RAIN_DIRECTIONS.map((option) => option.value)).toEqual([
      "down",
      "up",
    ]);
  });

  it("travels Speed Surface heights per second", () => {
    const frame = player(laserRain);
    const before = uniform(frame({ speed: 3 }), "travel");
    const after = uniform(frame({ speed: 3 }), "travel");
    expect(after - before).toBeCloseTo(3 * DT, 6);
  });
});
