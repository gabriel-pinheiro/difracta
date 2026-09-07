import { describe, expect, it } from "vitest";

import {
  applyPatch,
  applyPatches,
  invertPatches,
  patchesOverlap,
  pathsOverlap,
  type Patch,
} from "./patch.ts";

describe("patches", () => {
  const document = {
    installation: { id: "i", name: "Living" },
    outputs: { a: { id: "a", name: "Projector" } },
  };

  it("sets nested values immutably", () => {
    const next = applyPatch(document, {
      op: "set",
      path: ["outputs", "a", "name"],
      value: "TV",
    });
    expect(next.outputs.a?.name).toBe("TV");
    expect(document.outputs.a?.name).toBe("Projector");
    expect(next.installation).toBe(document.installation);
  });

  it("creates intermediate nodes and removes keys", () => {
    const withB = applyPatch(document, {
      op: "set",
      path: ["outputs", "b"],
      value: { id: "b", name: "B" },
    });
    expect(Object.keys(withB.outputs)).toEqual(["a", "b"]);
    const withoutA = applyPatch(withB, {
      op: "remove",
      path: ["outputs", "a"],
    });
    expect(Object.keys(withoutA.outputs)).toEqual(["b"]);
  });

  it("inverts an ordered patch list back to the original", () => {
    const patches: Patch[] = [
      { op: "set", path: ["outputs", "b"], value: { id: "b", name: "B" } },
      { op: "set", path: ["outputs", "b", "name"], value: "B2" },
      { op: "remove", path: ["outputs", "a"] },
    ];
    const inverse = invertPatches(document, patches);
    const changed = applyPatches(document, patches);
    expect(applyPatches(changed, inverse)).toEqual(document);
  });

  it("detects overlapping paths by prefix", () => {
    expect(pathsOverlap(["outputs", "a"], ["outputs", "a", "name"])).toBe(true);
    expect(pathsOverlap(["outputs", "a"], ["outputs", "b"])).toBe(false);
    expect(
      patchesOverlap(
        [{ op: "remove", path: ["outputs"] }],
        [{ op: "set", path: ["outputs", "x", "name"], value: 1 }],
      ),
    ).toBe(true);
  });
});
