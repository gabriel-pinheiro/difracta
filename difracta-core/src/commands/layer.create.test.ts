import { describe, expect, it } from "vitest";

import { executeCommand } from "../command/execute.ts";
import { emptyDocument, type Document } from "../document/document.ts";
import { createBuiltInRegistry } from "./index.ts";

const registry = createBuiltInRegistry();

function run(document: Document, name: string, payload: unknown): Document {
  const result = executeCommand(registry, document, name, payload);
  if (!result.ok) throw new Error(result.error);
  return result.document;
}

function scene(surfaces: readonly string[]): Document {
  let document = run(emptyDocument("Living"), "scene.create", {
    id: "s",
    name: "Live",
  });
  for (const surface of surfaces)
    document = run(document, "surface.create", {
      id: surface,
      name: surface,
    });
  return document;
}

function targetOf(document: Document, layerId: string): string | null {
  const layer = document.layers[layerId];
  if (layer?.kind !== "visual") throw new Error(`${layerId} is not visual`);
  return layer.target;
}

describe("layer.create Target", () => {
  it("leaves the Target empty when there are no Surfaces", () => {
    const document = run(scene([]), "layer.create", {
      id: "v",
      sceneId: "s",
      kind: "visual",
    });
    expect(targetOf(document, "v")).toBeNull();
  });

  it("picks the first Surface in order when no sibling has a Target", () => {
    let document = scene(["wall", "floor"]);
    document = run(document, "entity.move", {
      table: "surfaces",
      id: "floor",
      after: null,
    });
    document = run(document, "layer.create", {
      id: "v",
      sceneId: "s",
      kind: "visual",
    });
    expect(targetOf(document, "v")).toBe("floor");
  });

  it("inherits the Target of the sibling it lands next to", () => {
    let document = scene(["wall", "floor"]);
    document = run(document, "layer.create", {
      id: "a",
      sceneId: "s",
      kind: "visual",
      target: "floor",
    });
    document = run(document, "layer.create", {
      id: "f",
      sceneId: "s",
      kind: "filter",
    });
    // On top, next to the Filter Layer: falls back to the first Surface.
    document = run(document, "layer.create", {
      id: "top",
      sceneId: "s",
      kind: "visual",
    });
    expect(targetOf(document, "top")).toBe("wall");
    document = run(document, "layer.create", {
      id: "below",
      sceneId: "s",
      kind: "visual",
      after: "a",
    });
    expect(targetOf(document, "below")).toBe("floor");
    document = run(document, "layer.update", {
      layerId: "top",
      target: "floor",
    });
    document = run(document, "layer.create", {
      id: "newTop",
      sceneId: "s",
      kind: "visual",
    });
    expect(targetOf(document, "newTop")).toBe("floor");
  });

  it("keeps an explicit null and rejects an unknown Surface", () => {
    const document = scene(["wall"]);
    const none = run(document, "layer.create", {
      id: "v",
      sceneId: "s",
      kind: "visual",
      target: null,
    });
    expect(targetOf(none, "v")).toBeNull();
    const missing = executeCommand(registry, document, "layer.create", {
      sceneId: "s",
      kind: "visual",
      target: "nowhere",
    });
    expect(missing).toMatchObject({ ok: false });
    if (!missing.ok)
      expect(missing.error).toBe(
        "Target “nowhere” does not exist as a Surface or a Region.",
      );
    const onFilter = executeCommand(registry, document, "layer.create", {
      sceneId: "s",
      kind: "filter",
      target: "wall",
    });
    expect(onFilter).toMatchObject({ ok: false });
  });
});
