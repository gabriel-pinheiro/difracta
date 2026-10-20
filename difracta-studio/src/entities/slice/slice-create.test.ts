import { describe, expect, it } from "vitest";

import { createSliceSteps } from "./slice-create";

const offered = { width: 1920, height: 1080 };

describe("createSliceSteps", () => {
  it("fills the Display size first, then creates the first Slice without a rect", () => {
    expect(
      createSliceSteps({
        output: { id: "out", displaySize: null },
        sliceCount: 0,
        offered,
        id: "slice_1",
      }),
    ).toEqual([
      {
        name: "output.update",
        payload: { outputId: "out", displaySize: offered },
      },
      {
        name: "slice.create",
        payload: { id: "slice_1", outputId: "out", name: "Panel" },
      },
    ]);
  });

  it("leaves the place to core for New Slice and the navigator's + Slice", () => {
    expect(
      createSliceSteps({
        output: { id: "out", displaySize: offered },
        sliceCount: 3,
        offered,
        id: "slice_2",
      }),
    ).toEqual([
      {
        name: "slice.create",
        payload: { id: "slice_2", outputId: "out", name: "Slice" },
      },
    ]);
  });

  it("sends a drawn rectangle", () => {
    const rect = { x: 0, y: 0, width: 10, height: 10 };
    expect(
      createSliceSteps({
        output: { id: "out", displaySize: offered },
        sliceCount: 0,
        offered,
        id: "slice_3",
        rect,
      }),
    ).toEqual([
      {
        name: "slice.create",
        payload: { id: "slice_3", outputId: "out", name: "Slice", rect },
      },
    ]);
  });
});
