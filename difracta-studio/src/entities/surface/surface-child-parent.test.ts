import type { Document } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { surfaceChildParent } from "./surface-child-parent";

const document = {
  paths: { outline: { surfaceId: "wall" } },
} as unknown as Document;

describe("surfaceChildParent", () => {
  it("is the Surface a Path is on, and nothing when missing", () => {
    const parent = surfaceChildParent("paths");
    expect(parent(document, "outline")).toEqual({
      kind: "surface",
      id: "wall",
    });
    expect(parent(document, "gone")).toBeUndefined();
  });
});
