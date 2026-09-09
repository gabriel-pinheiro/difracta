import { describe, expect, it } from "vitest";

import { executeCommand } from "../command/execute.ts";
import { emptyDocument, type Document } from "../document/document.ts";
import { childLayers, descendantLayers } from "../document/layers.ts";
import { applyPatches } from "../document/patch.ts";
import { createBuiltInRegistry } from "./index.ts";

const registry = createBuiltInRegistry();

function run(document: Document, name: string, payload: unknown) {
  const result = executeCommand(registry, document, name, payload);
  if (!result.ok) throw new Error(result.error);
  return result;
}

function fails(document: Document, name: string, payload: unknown): string {
  const result = executeCommand(registry, document, name, payload);
  if (result.ok) throw new Error(`${name} was accepted.`);
  return result.error;
}

/** Two Scenes; A holds a Group with two Layers inside and one Filter at the root. */
function show(): Document {
  let document = emptyDocument("Living");
  document = run(document, "output.create", {
    id: "out_a",
    name: "A",
  }).document;
  document = run(document, "surface.create", {
    id: "sur_a",
    name: "Wall",
  }).document;
  document = run(document, "scene.create", {
    id: "scene_a",
    name: "Live",
  }).document;
  document = run(document, "scene.create", {
    id: "scene_b",
    name: "Idle",
  }).document;
  document = run(document, "layer.create", {
    id: "grp",
    kind: "group",
    sceneId: "scene_a",
    name: "Sky",
  }).document;
  document = run(document, "layer.create", {
    id: "stars",
    kind: "visual",
    sceneId: "scene_a",
    parentId: "grp",
    name: "Stars",
  }).document;
  document = run(document, "layer.create", {
    id: "moon",
    kind: "visual",
    sceneId: "scene_a",
    parentId: "grp",
    name: "Moon",
  }).document;
  return run(document, "layer.create", {
    id: "blur",
    kind: "filter",
    sceneId: "scene_a",
    name: "Blur",
  }).document;
}

const names = (document: Document, sceneId: string, parentId: string | null) =>
  childLayers(document.layers, sceneId, parentId).map((layer) => layer.name);

describe("scenes", () => {
  it("makes the first Scene active, plays others, and refuses removing the active one", () => {
    let document = emptyDocument("Living");
    expect(document.installation.activeScene).toBeNull();
    document = run(document, "scene.create", {
      id: "s1",
      name: "One",
    }).document;
    expect(document.installation.activeScene).toBe("s1");
    document = run(document, "scene.create", {
      id: "s2",
      name: "one",
    }).document;
    expect(document.scenes.s2?.name).toBe("one 1");
    expect(document.installation.activeScene).toBe("s1");
    const play = run(document, "scene.play", { sceneId: "s2" });
    expect(play.definition.kind).toBe("performance");
    expect(play.document.installation.activeScene).toBe("s2");
    expect(run(play.document, "scene.play", { sceneId: "s2" }).patches).toEqual(
      [],
    );
    expect(fails(play.document, "scene.remove", { sceneId: "s2" })).toMatch(
      /active/,
    );
    const removed = run(play.document, "scene.remove", { sceneId: "s1" });
    expect(Object.keys(removed.document.scenes)).toEqual(["s2"]);
  });

  it("removes a Scene's Layers with it and restores them on undo", () => {
    const document = show();
    const removed = run(
      run(document, "scene.play", { sceneId: "scene_b" }).document,
      "scene.remove",
      { sceneId: "scene_a" },
    );
    expect(Object.keys(removed.document.layers)).toEqual([]);
    expect(applyPatches(removed.document, removed.inverse).layers).toEqual(
      document.layers,
    );
  });

  it("duplicates a Scene deeply after the original, keeping nesting", () => {
    const document = show();
    const copied = run(document, "scene.duplicate", {
      sceneId: "scene_a",
      id: "scene_c",
    }).document;
    expect(
      Object.values(copied.scenes)
        .sort((a, b) => a.order.localeCompare(b.order))
        .map((s) => s.name),
    ).toEqual(["Live", "Live 1", "Idle"]);
    expect(names(copied, "scene_c", null)).toEqual(["Blur", "Sky"]);
    const group = childLayers(copied.layers, "scene_c", null).find(
      (l) => l.kind === "group",
    );
    expect(
      descendantLayers(copied.layers, group!.id).map((l) => l.name),
    ).toEqual(["Moon", "Stars"]);
    expect(Object.keys(copied.layers)).toHaveLength(8);
  });
});

describe("layers", () => {
  it("creates at the top of its parent, named per siblings, with kind defaults", () => {
    const document = show();
    expect(names(document, "scene_a", null)).toEqual(["Blur", "Sky"]);
    expect(names(document, "scene_a", "grp")).toEqual(["Moon", "Stars"]);
    expect(document.layers.stars).toMatchObject({
      kind: "visual",
      visual: null,
      target: null,
      opacity: 1,
      blendMode: "normal",
      enabled: true,
    });
    expect(document.layers.blur).toMatchObject({
      kind: "filter",
      filter: null,
      mix: 1,
    });
    const again = run(document, "layer.create", {
      kind: "visual",
      sceneId: "scene_a",
      parentId: "grp",
      name: "Stars",
    }).document;
    expect(names(again, "scene_a", "grp")).toEqual([
      "Stars 1",
      "Moon",
      "Stars",
    ]);
    const unnamed = run(document, "layer.create", {
      kind: "group",
      sceneId: "scene_b",
    }).document;
    expect(names(unnamed, "scene_b", null)).toEqual(["Group"]);
    expect(
      fails(document, "layer.create", {
        kind: "visual",
        sceneId: "scene_a",
        parentId: "stars",
      }),
    ).toMatch(/not in Scene/);
  });

  it("updates fields according to kind", () => {
    const document = show();
    const updated = run(document, "layer.update", {
      layerId: "stars",
      enabled: false,
      opacity: 0.5,
      target: "sur_a",
    }).document;
    expect(updated.layers.stars).toMatchObject({
      enabled: false,
      opacity: 0.5,
      target: "sur_a",
    });
    expect(
      fails(document, "layer.update", { layerId: "blur", opacity: 0.5 }),
    ).toMatch(/Visual/);
    expect(
      fails(document, "layer.update", { layerId: "stars", mix: 0.5 }),
    ).toMatch(/Filter/);
    expect(
      fails(document, "layer.update", { layerId: "stars", target: "nope" }),
    ).toMatch(/does not exist/);
    expect(
      run(document, "layer.update", { layerId: "stars", enabled: false }).label,
    ).toBe("Disable Layer");
    // Removing the Surface clears the Target.
    const gone = run(updated, "surface.remove", {
      surfaceId: "sur_a",
    }).document;
    expect(gone.layers.stars).toMatchObject({ target: null });
  });

  it("moves within a parent, into a Group, and across Scenes with contents", () => {
    let document = show();
    document = run(document, "layer.move", {
      layerId: "blur",
      sceneId: "scene_a",
      parentId: null,
      after: "grp",
    }).document;
    expect(names(document, "scene_a", null)).toEqual(["Sky", "Blur"]);
    document = run(document, "layer.move", {
      layerId: "blur",
      sceneId: "scene_a",
      parentId: "grp",
      after: null,
    }).document;
    expect(names(document, "scene_a", "grp")).toEqual([
      "Blur",
      "Moon",
      "Stars",
    ]);
    document = run(document, "layer.move", {
      layerId: "grp",
      sceneId: "scene_b",
      parentId: null,
      after: null,
    }).document;
    expect(names(document, "scene_a", null)).toEqual([]);
    expect(names(document, "scene_b", null)).toEqual(["Sky"]);
    expect(
      descendantLayers(document.layers, "grp").every(
        (l) => l.sceneId === "scene_b",
      ),
    ).toBe(true);
    expect(
      fails(document, "layer.move", {
        layerId: "grp",
        sceneId: "scene_b",
        parentId: "grp",
        after: null,
      }),
    ).toMatch(/into itself/);
    expect(
      fails(document, "layer.move", {
        layerId: "stars",
        sceneId: "scene_a",
        parentId: "grp",
        after: null,
      }),
    ).toMatch(/not in Scene/);
  });

  it("groups, ungroups and duplicates with contents", () => {
    let document = show();
    document = run(document, "layer.group", {
      layerId: "blur",
      id: "wrap",
    }).document;
    expect(names(document, "scene_a", null)).toEqual(["Group", "Sky"]);
    expect(names(document, "scene_a", "wrap")).toEqual(["Blur"]);
    document = run(document, "layer.ungroup", { layerId: "grp" }).document;
    expect(names(document, "scene_a", null)).toEqual([
      "Group",
      "Moon",
      "Stars",
    ]);
    expect(document.layers.grp).toBeUndefined();
    const copied = run(document, "layer.duplicate", {
      layerId: "wrap",
      id: "wrap2",
    }).document;
    expect(names(copied, "scene_a", null)).toEqual([
      "Group",
      "Group 1",
      "Moon",
      "Stars",
    ]);
    expect(names(copied, "scene_a", "wrap2")).toEqual(["Blur"]);
    const removed = run(copied, "layer.remove", { layerId: "wrap2" }).document;
    expect(Object.keys(removed.layers).sort()).toEqual(
      Object.keys(document.layers).sort(),
    );
  });
});
