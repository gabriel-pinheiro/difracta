import type { Document } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { sliceParent } from "./slice-parent";

const document = {
  slices: { center: { outputId: "led" } },
} as unknown as Document;

describe("sliceParent", () => {
  it("is the Output a Slice is on, and nothing when missing", () => {
    expect(sliceParent(document, "center")).toEqual({
      kind: "output",
      id: "led",
    });
    expect(sliceParent(document, "gone")).toBeUndefined();
  });
});
