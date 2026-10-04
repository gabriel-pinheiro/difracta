import type { Document } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { outputMaskParent } from "./output-mask-parent";

const document = {
  outputMasks: { window: { outputId: "beam" } },
} as unknown as Document;

describe("outputMaskParent", () => {
  it("is the Output an Output Mask is on, and nothing when missing", () => {
    expect(outputMaskParent(document, "window")).toEqual({
      kind: "output",
      id: "beam",
    });
    expect(outputMaskParent(document, "gone")).toBeUndefined();
  });
});
