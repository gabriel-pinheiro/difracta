import { describe, expect, it } from "vitest";

import { executeCommand } from "../command/execute.ts";
import { emptyDocument, type Document } from "../document/document.ts";
import { createBuiltInRegistry } from "./index.ts";

const registry = createBuiltInRegistry();

function run(document: Document, name: string, payload: unknown) {
  const result = executeCommand(registry, document, name, payload);
  if (!result.ok) throw new Error(result.error);
  return result;
}

/** Outputs A and B; Wall is on B and keeps a disabled mapping for A, Floor is on A, Score on both. */
function twoOutputs(): Document {
  let document = emptyDocument("Living");
  for (const name of ["A", "B"])
    document = run(document, "output.create", {
      id: `out_${name}`,
      name,
    }).document;
  document = run(document, "surface.create", {
    id: "sur_a",
    name: "Wall",
    outputs: ["out_A"],
  }).document;
  document = run(document, "surface.assign", {
    surfaceId: "sur_a",
    outputs: ["out_B"],
  }).document;
  document = run(document, "surface.assign", {
    surfaceId: "sur_a",
    outputs: ["out_A"],
    enabled: false,
  }).document;
  document = run(document, "surface.create", {
    id: "sur_b",
    name: "Floor",
    outputs: ["out_A"],
  }).document;
  return run(document, "surface.create", {
    id: "sur_c",
    name: "Score",
    outputs: ["out_A", "out_B"],
  }).document;
}

describe("output.remove", () => {
  it("warns for each Surface left without an Output and each mapping it drops", () => {
    const removed = run(twoOutputs(), "output.remove", { outputId: "out_A" });
    expect(removed.warnings).toEqual([
      "Surface “Wall” lost its Surface Mapping for “A”.",
      "Surface “Floor” lost its Output; nothing projects it until one is picked.",
      "Surface “Score” lost its Surface Mapping for “A”.",
    ]);
  });

  it("warns only for the Surfaces it touches", () => {
    const removed = run(twoOutputs(), "output.remove", { outputId: "out_B" });
    expect(removed.warnings).toEqual([
      "Surface “Wall” lost its Output; nothing projects it until one is picked.",
      "Surface “Score” lost its Surface Mapping for “B”.",
    ]);
    const lone = run(
      run(emptyDocument("Living"), "output.create", {
        id: "out_a",
        name: "Projector",
      }).document,
      "output.remove",
      { outputId: "out_a" },
    );
    expect(lone.warnings).toEqual([]);
  });

  it("rejects an Output that does not exist", () => {
    const result = executeCommand(registry, twoOutputs(), "output.remove", {
      outputId: "out_missing",
    });
    expect(result.ok).toBe(false);
  });
});
