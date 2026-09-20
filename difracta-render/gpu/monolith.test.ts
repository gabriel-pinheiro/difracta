import { describe, expect, it } from "vitest";

import { Stage } from "./fixtures.ts";
import { withRenderer } from "./harness.ts";

const renderer = withRenderer();

describe("Monolith pixels", () => {
  it.each(["low", "medium", "high"])(
    "renders the sculpture over a dark ground at %s Quality",
    async (quality) => {
      const stage = new Stage()
        .surface("wall")
        .visual("monolith", "wall", "monolith", {
          params: { quality, renderResolution: 1 },
        });
      const frame = await renderer().render(stage.document(), 240, 180);
      let lit = 0;
      let dark = 0;
      for (let i = 0; i < frame.pixels.length; i += 4) {
        const light = Math.max(
          frame.pixels[i] ?? 0,
          frame.pixels[i + 1] ?? 0,
          frame.pixels[i + 2] ?? 0,
        );
        if (light > 25) lit += 1;
        if (light < 8) dark += 1;
      }
      expect(lit).toBeGreaterThan(1000);
      expect(dark).toBeGreaterThan(240 * 180 * 0.7);
      expect(frame.report.issues).toEqual([]);
    },
  );

  it("honours all three light alphas and preserves its opaque ground", async () => {
    const off = [1, 1, 1, 0];
    const stage = new Stage()
      .surface("wall")
      .solid("under", "wall", [1, 0, 0, 1])
      .visual("monolith", "wall", "monolith", {
        params: { coreColor: off, rimColorA: off, rimColorB: off },
      });
    const frame = await renderer().render(stage.document(), 120, 90);
    for (let i = 0; i < frame.pixels.length; i += 4) {
      expect(Array.from(frame.pixels.subarray(i, i + 4))).toEqual([
        0, 0, 0, 255,
      ]);
    }
  });

  it("keeps a narrow pillar's default framing away from its edges", async () => {
    const stage = new Stage()
      .surface("pillar")
      .visual("monolith", "pillar", "monolith");
    const width = 80;
    const height = 240;
    const frame = await renderer().render(stage.document(), width, height);
    for (let y = 0; y < height; y += 1)
      for (const x of [0, width - 1]) {
        const index = (y * width + x) * 4;
        expect(
          Math.max(...frame.pixels.subarray(index, index + 3)),
        ).toBeLessThan(8);
      }
  });
});
