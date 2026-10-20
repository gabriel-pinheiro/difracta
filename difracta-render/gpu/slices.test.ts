import { describe, expect, it } from "vitest";

import { OUTPUT, rect, rotatedQuad, Stage } from "./fixtures.ts";
import { dump } from "./dump.ts";
import { withRenderer } from "./harness.ts";
import { expectColor, mean, pixel, samePixels } from "./pixels.ts";

/**
 * Outputs with Slices: the frame renders laid out like the stage and each
 * Slice is copied to its rectangle of the Display Frame, turned and scaled
 * back. Colours tell the panels apart: Left red, Center green, Right blue.
 */
const renderer = withRenderer();
const RED = [1, 0, 0, 1] as const;
const GREEN = [0, 1, 0, 1] as const;
const BLUE = [0, 0, 1, 1] as const;

/**
 * A 300×100 Display Frame packing three 100×100 panels: Left in place,
 * Center at 300 on stage, Right turned 90° and doubled at 600; the stage
 * is 800×200.
 */
function packed(): Stage {
  return new Stage()
    .command("output.update", {
      outputId: OUTPUT,
      displaySize: { width: 300, height: 100 },
    })
    .command("slice.create", {
      id: "left",
      outputId: OUTPUT,
      name: "Left",
      rect: { x: 0, y: 0, width: 100, height: 100 },
    })
    .command("slice.create", {
      id: "center",
      outputId: OUTPUT,
      name: "Center",
      rect: { x: 100, y: 0, width: 100, height: 100 },
      position: { x: 300, y: 0 },
    })
    .command("slice.create", {
      id: "right",
      outputId: OUTPUT,
      name: "Right",
      rect: { x: 200, y: 0, width: 100, height: 100 },
      position: { x: 600, y: 0 },
      rotation: 90,
      scale: 2,
    });
}

/** A Surface following one Slice. */
function on(stage: Stage, surfaceId: string, sliceId: string): Stage {
  return stage
    .surface(surfaceId)
    .command("surface.follow", { surfaceId, follow: sliceId });
}

describe("Slices", () => {
  it("renders one Slice covering the Display Frame exactly as no Slice", async () => {
    const corners = rotatedQuad({ x: 0.5, y: 0.5 }, 0.3, 20);
    const plain = await renderer().render(
      new Stage()
        .surface("wall", corners)
        .solid("fill", "wall", RED)
        .document(),
      300,
      100,
    );
    let sliced = new Stage()
      .command("output.update", {
        outputId: OUTPUT,
        displaySize: { width: 300, height: 100 },
      })
      .command("slice.create", { outputId: OUTPUT, name: "All" })
      .surface("wall")
      .command("surface.follow", { surfaceId: "wall", follow: null });
    for (const [corner, point] of Object.entries(corners))
      sliced = sliced.command("surface.corner.set", {
        surfaceId: "wall",
        corner,
        point,
      });
    const frame = await renderer().render(
      sliced.solid("fill", "wall", RED).document(),
      300,
      100,
    );
    expect(samePixels(plain, frame)).toBe(true);
  });

  it("puts each panel at its Display rectangle, turned and scaled back", async () => {
    let stage = packed();
    stage = on(stage, "l", "left").solid("a", "l", RED);
    stage = on(stage, "c", "center").solid("b", "c", GREEN);
    // Right lit on the top half of the stage only, which its 90° turn puts
    // on the left half of its Display rectangle.
    stage = on(stage, "r", "right")
      .mask("top", "r", rect(0, 0, 1, 0.5))
      .solid("d", "r", BLUE);
    const frame = await renderer().render(stage.document(), 300, 100);
    expectColor(
      mean(frame, { x: 5, y: 5, width: 90, height: 90 }),
      [255, 0, 0],
    );
    expectColor(
      mean(frame, { x: 105, y: 5, width: 90, height: 90 }),
      [0, 255, 0],
    );
    expectColor(
      mean(frame, { x: 205, y: 5, width: 40, height: 90 }),
      [0, 0, 255],
    );
    expectColor(
      mean(frame, { x: 255, y: 5, width: 40, height: 90 }),
      [0, 0, 0],
    );
  });

  it("keeps a root Filter from crossing into a panel that is a neighbour only in the processor's map", async () => {
    let stage = packed();
    stage = on(stage, "l", "left").solid("a", "l", RED);
    stage = on(stage, "c", "center").solid("b", "c", GREEN);
    // Smeared on the stage, Left's red reaches the gap, never Center.
    const frame = await renderer().render(
      stage.filter("smear", "test-smear-right").document(),
      300,
      100,
    );
    expectColor(pixel(frame, 50, 50), [255, 0, 0]);
    for (const x of [100, 101, 110, 130])
      expectColor(pixel(frame, x, 50), [0, 255, 0]);
  });

  it("applies Output Masks on the stage, before slicing", async () => {
    let stage = packed();
    stage = on(stage, "l", "left").solid("a", "l", RED);
    stage = on(stage, "c", "center").solid("b", "c", GREEN);
    // The stage's left half holds Left and Center; Right is past it.
    const frame = await renderer().render(
      on(stage, "r", "right")
        .solid("d", "r", BLUE)
        .outputMask("half", rect(0, 0, 0.5, 1))
        .document(),
      300,
      100,
    );
    expectColor(pixel(frame, 50, 50), [0, 0, 0]);
    expectColor(pixel(frame, 150, 50), [0, 0, 0]);
    expectColor(pixel(frame, 250, 50), [0, 0, 255]);
  });

  it("draws Slices in order, the later winning where they overlap in the Display Frame", async () => {
    const stage = new Stage()
      .command("output.update", {
        outputId: OUTPUT,
        displaySize: { width: 300, height: 100 },
      })
      .command("slice.create", {
        id: "a",
        outputId: OUTPUT,
        name: "A",
        rect: { x: 0, y: 0, width: 200, height: 100 },
      })
      .command("slice.create", {
        id: "b",
        outputId: OUTPUT,
        name: "B",
        rect: { x: 100, y: 0, width: 200, height: 100 },
        position: { x: 400, y: 0 },
      });
    const frame = await renderer().render(
      on(on(stage, "ra", "a").solid("la", "ra", RED), "rb", "b")
        .solid("lb", "rb", GREEN)
        .document(),
      300,
      100,
    );
    expectColor(pixel(frame, 50, 50), [255, 0, 0]);
    expectColor(pixel(frame, 150, 50), [0, 255, 0]);
    expectColor(pixel(frame, 250, 50), [0, 255, 0]);
  });
});

/** Output-level calibration showing the Slice test card with `sliceId` selected. */
function card(stage: Stage, sliceId: string): Stage {
  return stage.command("calibration.set", {
    surfaceId: null,
    outputId: OUTPUT,
    sliceId,
    maskId: null,
    pathId: null,
    corner: null,
    point: null,
    view: "patterns",
    owner: "gpu",
  });
}

/** A selected Slice's light cell, not its dimmer shade, on its strongest channel. */
function light(rgb: readonly number[]): boolean {
  return Math.max(...rgb.slice(0, 3)) > 190;
}

describe("the Slice test card", () => {
  /**
   * One 512×128 Slice, a long row of 64-pixel checker cells; the name "A"
   * is short, so its plate sits clear of the cells sampled.
   */
  function strip(rotation: 0 | 90 | 180 | 270): Stage {
    return new Stage()
      .command("output.update", {
        outputId: OUTPUT,
        displaySize: { width: 512, height: 128 },
      })
      .command("slice.create", { id: "a", outputId: OUTPUT, name: "A" })
      .command("slice.update", { sliceId: "a", rotation });
  }
  /** Cells sampled away from the diagonals, circle and plate: column, row, x, y. */
  const CELLS = [
    [0, 0, 20, 50],
    [1, 0, 84, 50],
    [2, 0, 148, 50],
    [0, 1, 20, 100],
    [7, 1, 490, 100],
  ] as const;

  it.each([0, 90, 180, 270] as const)(
    "counts checker cells from the Slice's Display top-left at %i°",
    async (rotation) => {
      const frame = await renderer().render(
        card(strip(rotation), "a").document(),
        512,
        128,
      );
      await dump(frame, `slice-card-strip-${String(rotation)}`);
      for (const [column, row, x, y] of CELLS)
        expect(light(pixel(frame, x, y)), `cell ${column},${row}`).toBe(
          (column + row) % 2 === 0,
        );
      // A white border on the Display Frame's edges.
      for (const [x, y] of [
        [0, 30],
        [511, 30],
        [300, 0],
        [300, 127],
      ] as const)
        expect(Math.min(...pixel(frame, x, y))).toBeGreaterThan(200);
    },
  );

  it("draws every Slice, the selected one brighter", async () => {
    const frame = await renderer().render(
      card(packed(), "right").document(),
      300,
      100,
    );
    await dump(frame, "slice-card-packed");
    // Each tile's top-left light cell, clear of the border and diagonals.
    const left = pixel(frame, 12, 4 + 4);
    const center = pixel(frame, 112, 8);
    const right = pixel(frame, 212, 8);
    expect(light(right)).toBe(true);
    expect(Math.max(...right)).toBeGreaterThan(Math.max(...left) + 60);
    expect(Math.max(...right)).toBeGreaterThan(Math.max(...center) + 60);
    // Different hues: no two tiles share their strongest channel mix.
    expect(left).not.toEqual(center);
    expect(center).not.toEqual(right);
  });
});

describe("Slices fitted into the canvas", () => {
  /** A 1920×1080 input whose halves are swapped on stage. */
  function swapped(): Stage {
    let stage = new Stage()
      .command("output.update", {
        outputId: OUTPUT,
        displaySize: { width: 1920, height: 1080 },
      })
      .command("slice.create", {
        id: "a",
        outputId: OUTPUT,
        name: "A",
        rect: { x: 0, y: 0, width: 960, height: 1080 },
        position: { x: 960, y: 0 },
      })
      .command("slice.create", {
        id: "b",
        outputId: OUTPUT,
        name: "B",
        rect: { x: 960, y: 0, width: 960, height: 1080 },
        position: { x: 0, y: 0 },
      });
    stage = on(stage, "sa", "a").solid("ra", "sa", RED);
    return on(stage, "sb", "b").solid("gb", "sb", GREEN);
  }

  it("is exact on a canvas matching on one side and larger on the other", async () => {
    const frame = await renderer().render(swapped().document(), 1920, 1200);
    expectColor(pixel(frame, 959, 540), [255, 0, 0], 0);
    expectColor(pixel(frame, 960, 540), [0, 255, 0], 0);
    expectColor(pixel(frame, 1919, 1079), [0, 255, 0], 0);
    expectColor(pixel(frame, 100, 1080), [0, 0, 0], 0);
    expectColor(pixel(frame, 1800, 1199), [0, 0, 0], 0);
  });

  it("scales the whole map into a smaller canvas from the top-left", async () => {
    const frame = await renderer().render(swapped().document(), 1280, 720);
    expectColor(pixel(frame, 630, 360), [255, 0, 0]);
    expectColor(pixel(frame, 650, 360), [0, 255, 0]);
    expectColor(pixel(frame, 1275, 715), [0, 255, 0]);
  });
});
