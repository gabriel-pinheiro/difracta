import { describe, expect, it } from "vitest";

import { createShaderPlayer } from "./shader-player.ts";
import { defineShaderVisual } from "./shader-visual.ts";

let updates = 0;
let disposed = 0;

/** Reports once, then throws from its second update. */
const faulty = defineShaderVisual({
  id: "faulty",
  name: "Faulty",
  description: "Throws on its second frame.",
  parameters: {},
  fragment: "vec4 render_visual(vec2 uv) { return vec4(1.0); }",
  create: () => ({
    update() {
      updates += 1;
      if (updates > 1) throw new Error("boom");
      return { uniforms: { phase: 1 } };
    },
    dispose() {
      disposed += 1;
    },
  }),
});

describe("createShaderPlayer", () => {
  it("stops an instance that throws and is blank from then on", () => {
    updates = 0;
    disposed = 0;
    const player = createShaderPlayer(faulty, { width: 1, height: 1, seed: 1 });
    expect(player.frame(0.01, {}, 1, 1)).toEqual({
      blank: false,
      changed: true,
      uniforms: { phase: 1 },
      resolution: 1,
    });
    const failed = player.frame(0.01, {}, 1, 1);
    // The Layer going blank changes the picture once.
    expect(failed).toMatchObject({ blank: true, changed: true });
    expect(failed.failure?.message).toBe("boom");
    expect(disposed).toBe(1);
    expect(() => player.cue("hit")).not.toThrow();
    const later = player.frame(0.01, {}, 1, 1);
    expect(later).toMatchObject({ blank: true, changed: false });
    expect(later.failure).toBe(failed.failure);
    expect(updates).toBe(2);
  });

  it("carries the resolution an update asks for until it asks again", () => {
    let asked: number | undefined = 0.5;
    const scaled = defineShaderVisual({
      id: "scaled",
      name: "Scaled",
      description: "Asks for a resolution when told to.",
      parameters: {},
      fragment: "vec4 render_visual(vec2 uv) { return vec4(1.0); }",
      create: () => ({
        update: () => (asked === undefined ? {} : { resolution: asked }),
      }),
    });
    const player = createShaderPlayer(scaled, { width: 1, height: 1, seed: 1 });
    expect(player.frame(0.01, {}, 1, 1).resolution).toBe(0.5);
    asked = undefined;
    expect(player.frame(0.01, {}, 1, 1).resolution).toBe(0.5);
    asked = 1;
    expect(player.frame(0.01, {}, 1, 1).resolution).toBe(1);
  });
});
