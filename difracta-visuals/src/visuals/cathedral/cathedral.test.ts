import { createRandom, createShaderPlayer } from "@difracta/render/sdk";
import { describe, expect, it } from "vitest";

import { CAMERA_WRAP, createCamera } from "./camera.ts";
import { cathedral } from "./cathedral.ts";
import {
  createDirector,
  type Director,
  type DirectorLook,
} from "./director.ts";
import {
  BAY,
  MAX_BEAMS,
  MAX_LASERS,
  packBeams,
  packLasers,
} from "./fixtures.ts";
import { ARCHITECTURES, CATHEDRAL_CUES, QUALITIES } from "./parameters.ts";

const DT = 1 / 60;

/** Advances a director by `seconds` and returns the last look. */
function play(director: Director, seconds: number, build = 8): DirectorLook {
  let look = director.advance(DT, build);
  for (let i = 1; i < Math.round(seconds / DT); i += 1)
    look = director.advance(DT, build);
  return look;
}

describe("Cathedral", () => {
  it("keeps its option and Cue order, which the fragment and thumbnail rely on", () => {
    expect(cathedral.fragment).toContain("vec4 render_visual(vec2 uv)");
    expect(ARCHITECTURES.map((option) => option.value)).toEqual([
      "gothic",
      "brutalist",
    ]);
    expect(QUALITIES.map((option) => option.value)).toEqual([
      "low",
      "medium",
      "high",
    ]);
    expect(CATHEDRAL_CUES[0].key).toBe("kick");
  });

  it("hands the fragment every uniform it declares, none named like a Parameter", () => {
    const player = createShaderPlayer(cathedral, {
      width: 320,
      height: 180,
      seed: "test",
    });
    const first = player.frame(DT, {}, 320, 180);
    expect(first).toMatchObject({
      blank: false,
      changed: true,
      resolution: 0.5,
    });
    const parameters = Object.keys(cathedral.parameters);
    for (const name of Object.keys(first.uniforms)) {
      expect(parameters).not.toContain(name);
      expect(cathedral.fragment).toContain(`u_${name}`);
    }
    player.cue("drop");
    const next = player.frame(DT, { renderResolution: 0.25 }, 320, 180);
    expect(next.resolution).toBe(0.25);
    expect(next.uniforms.strobe).toBeGreaterThan(0.5);
  });
});

describe("Cathedral director", () => {
  it("rests calm, and a Drop lands within a tenth of a second with strobe, surge and shake", () => {
    const director = createDirector();
    const calm = play(director, 1);
    expect(calm).toMatchObject({ section: "calm", wild: 0, strobe: 0 });
    director.cue("drop");
    const landing = play(director, 0.1);
    expect(landing.wild).toBeGreaterThan(0.5);
    expect(landing.strobe).toBeGreaterThan(0);
    expect(landing.shake).toBeGreaterThan(0.5);
    expect(landing.travel).toBeGreaterThan(calm.travel * 2);
    expect(play(director, 1).wild).toBeGreaterThan(0.99);
  });

  it("climbs a Build over Build Duration, and a repeated Build does not restart it", () => {
    const director = createDirector();
    director.cue("build");
    expect(play(director, 2, 4).buildProgress).toBeCloseTo(0.5, 1);
    director.cue("build");
    const peak = play(director, 3, 4);
    expect(peak.buildProgress).toBe(1);
    expect(peak.focus).toBeGreaterThan(0.95);
    expect(peak.fog).toBeGreaterThan(1.8);
    expect(peak.travel).toBeLessThan(0.35);
    director.cue("drop");
    director.cue("build");
    expect(play(director, DT).buildProgress).toBeLessThan(0.01);
  });

  it("gives way to the solo beam on Breakdown and returns on Calm", () => {
    const director = createDirector();
    director.cue("breakdown");
    const breakdown = play(director, 5);
    expect(breakdown.solo).toBeGreaterThan(0.99);
    expect(breakdown.laser).toBeLessThan(0.01);
    director.cue("calm");
    expect(play(director, 6).solo).toBeLessThan(0.01);
  });

  it("pulses the wash and steps the chase on a Kick, then lets the pulse go", () => {
    const director = createDirector();
    const before = play(director, 2);
    director.cue("kick");
    const hit = director.advance(DT, 8);
    expect(hit.wash).toBeGreaterThan(before.wash + 0.7);
    expect(hit.kicks).toBe(before.kicks + 1);
    expect(play(director, 1.5).wash).toBeCloseTo(before.wash, 2);
  });
});

describe("Cathedral rig", () => {
  const calm = play(createDirector(), 1);
  const frame = (cameraZ: number, beams = 8, look = calm) => {
    const origins = new Float32Array(MAX_BEAMS * 4);
    const directions = new Float32Array(MAX_BEAMS * 4);
    const count = packBeams(
      { cameraZ, time: 3, beams, energy: 0.6, look },
      origins,
      directions,
    );
    return { origins, directions, count };
  };

  it("aims a fixture by its world row, so passing a row moves no beam", () => {
    const before = frame(2 * BAY - 0.1);
    const after = frame(2 * BAY + 0.1);
    let matched = 0;
    for (let a = 0; a < before.count; a += 1)
      for (let b = 0; b < after.count; b += 1) {
        const same = [0, 1, 2].every(
          (axis) =>
            before.origins[a * 4 + axis] === after.origins[b * 4 + axis],
        );
        if (!same) continue;
        matched += 1;
        for (let axis = 0; axis < 4; axis += 1)
          expect(after.directions[b * 4 + axis]).toBeCloseTo(
            before.directions[a * 4 + axis] ?? 0,
            6,
          );
      }
    expect(matched).toBe(6);
  });

  it("fades a row in far ahead and out overhead", () => {
    const { origins, count } = frame(2 * BAY, 8);
    expect(count).toBe(8);
    // Rows 3 to 6: the farthest has only just appeared.
    expect(origins[6 * 4 + 3]).toBeCloseTo(0, 6);
    expect(origins[0 * 4 + 3]).toBeGreaterThan(0.2);
  });

  it("puts the solo beam first and never overfills its arrays", () => {
    const director = createDirector();
    director.cue("breakdown");
    const { origins, count } = frame(10, 99, play(director, 5));
    expect(count).toBe(MAX_BEAMS);
    expect(origins[0]).toBe(0);
    expect(origins[3]).toBeGreaterThan(0);
    expect(origins[4 + 3]).toBeCloseTo(0, 2);
  });

  it("fans the lasers toward the viewer, and switches them off at zero", () => {
    const directions = new Float32Array(MAX_LASERS * 4);
    const drop = createDirector();
    drop.cue("drop");
    const look = play(drop, 1);
    const off = packLasers(
      { cameraZ: 0, time: 1, amount: 0, energy: 1, look },
      directions,
    );
    expect(off.count).toBe(0);
    const on = packLasers(
      { cameraZ: 0, time: 1, amount: 1, energy: 1, look },
      directions,
    );
    expect(on.count).toBe(MAX_LASERS);
    for (let laser = 0; laser < MAX_LASERS; laser += 1) {
      const [x = 0, y = 0, z = 0, level = 0] = directions.subarray(
        laser * 4,
        laser * 4 + 4,
      );
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 5);
      expect(z).toBeLessThan(0);
      expect(level).toBeGreaterThan(0);
    }
  });
});

describe("Cathedral camera", () => {
  it("integrates travel, wraps inside its period and holds still at zero speed", () => {
    const camera = createCamera(createRandom("test"));
    const start = camera.advance(DT, 0, 0).position[2];
    expect(camera.advance(DT, 0, 0).position[2]).toBe(start);
    const moved = camera.advance(1, 1, 0).position[2];
    expect((moved - start + CAMERA_WRAP) % CAMERA_WRAP).toBeCloseTo(2.4, 6);
    for (let i = 0; i < 400; i += 1) {
      const z = camera.advance(1, 4, 0).position[2];
      expect(z).toBeGreaterThanOrEqual(0);
      expect(z).toBeLessThan(CAMERA_WRAP);
    }
  });

  it("shakes only the view, never the travel", () => {
    const steady = createCamera(createRandom("same"));
    const shaken = createCamera(createRandom("same"));
    const a = steady.advance(DT, 1, 0);
    const b = shaken.advance(DT, 1, 1);
    expect(b.position[2]).toBe(a.position[2]);
    expect(b.turn).not.toEqual(a.turn);
  });
});
