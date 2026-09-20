import { describe, expect, it } from "vitest";

import { defineShaderVisual } from "./shader-visual.ts";

describe("defineShaderVisual", () => {
  it("refuses a Parameter named like an engine uniform", () => {
    expect(() =>
      defineShaderVisual({
        id: "clash",
        name: "Clash",
        description: "Keys a Parameter like the prelude's resolution.",
        parameters: {
          resolution: {
            kind: "number",
            label: "Resolution",
            default: 1,
            min: 0,
            max: 1,
            step: 0.1,
          },
        },
        fragment: "vec4 render_visual(vec2 uv) { return vec4(1.0); }",
      }),
    ).toThrow(/u_resolution/);
  });
});
