import { describe, expect, it } from "vitest";

import { executeCommand } from "../command/execute.ts";
import { emptyDocument, type Document } from "../document/document.ts";
import { orderedEntries } from "../document/order.ts";
import { applyPatches } from "../document/patch.ts";
import { createBuiltInRegistry } from "./index.ts";

const registry = createBuiltInRegistry();

function run(document: Document, name: string, payload: unknown) {
  const result = executeCommand(registry, document, name, payload);
  if (!result.ok) throw new Error(result.error);
  return result;
}

describe("built-in commands", () => {
  it("creates, renames and removes Outputs, numbering taken names", () => {
    const start = emptyDocument("Living");
    const created = run(start, "output.create", {
      id: "out_a",
      name: "Projector",
    });
    expect(created.document.outputs.out_a).toEqual({
      id: "out_a",
      name: "Projector",
      limitPixelRatio: false,
      order: "a0",
    });
    expect(created.label).toBe("Create Output “Projector”");

    const numbered = run(created.document, "output.create", {
      id: "out_b",
      name: "projector",
    });
    expect(numbered.document.outputs.out_b?.name).toBe("projector 1");
    const renamedIntoClash = run(numbered.document, "output.rename", {
      outputId: "out_b",
      name: "Projector",
    });
    expect(renamedIntoClash.document.outputs.out_b?.name).toBe("Projector 1");
    const keepsOwnName = run(numbered.document, "output.rename", {
      outputId: "out_a",
      name: "Projector",
    });
    expect(keepsOwnName.patches).toEqual([]);

    const renamed = run(created.document, "output.rename", {
      outputId: "out_a",
      name: "TV",
    });
    expect(renamed.document.outputs.out_a?.name).toBe("TV");
    expect(renamed.coalesceKey).toBe("output.rename:out_a");
    expect(applyPatches(renamed.document, renamed.inverse)).toEqual(
      created.document,
    );

    const removed = run(renamed.document, "output.remove", {
      outputId: "out_a",
    });
    expect(removed.document.outputs).toEqual({});
    expect(applyPatches(removed.document, removed.inverse)).toEqual(
      renamed.document,
    );
  });

  it("updates Output settings and skips unchanged ones", () => {
    const start = run(emptyDocument("Living"), "output.create", {
      id: "out_a",
      name: "Projector",
    }).document;
    const limited = run(start, "output.update", {
      outputId: "out_a",
      limitPixelRatio: true,
    });
    expect(limited.document.outputs.out_a?.limitPixelRatio).toBe(true);
    const unchanged = run(limited.document, "output.update", {
      outputId: "out_a",
      limitPixelRatio: true,
    });
    expect(unchanged.patches).toEqual([]);
  });

  it("moves entities among their siblings with one order patch", () => {
    let document = emptyDocument("Living");
    for (const name of ["A", "B", "C"]) {
      document = run(document, "output.create", {
        id: `out_${name}`,
        name,
      }).document;
    }
    const names = (candidate: Document) =>
      orderedEntries(candidate.outputs).map((output) => output.name);
    expect(names(document)).toEqual(["A", "B", "C"]);

    const moved = run(document, "entity.move", {
      table: "outputs",
      id: "out_C",
      after: null,
    });
    expect(moved.patches).toHaveLength(1);
    expect(names(moved.document)).toEqual(["C", "A", "B"]);
    expect(moved.label).toBe("Move Output");
    expect(applyPatches(moved.document, moved.inverse)).toEqual(document);

    const unchanged = run(moved.document, "entity.move", {
      table: "outputs",
      id: "out_A",
      after: "out_C",
    });
    expect(unchanged.patches).toEqual([]);
  });

  it("creates Surfaces, assigning the only Output with a default mapping", () => {
    const unassigned = run(emptyDocument("Living"), "surface.create", {
      id: "sur_a",
      name: "Wall",
    });
    expect(unassigned.document.surfaces.sur_a).toEqual({
      id: "sur_a",
      name: "Wall",
      output: null,
      mappings: {},
      order: "a0",
    });
    expect(unassigned.label).toBe("Create Surface “Wall”");

    const oneOutput = run(emptyDocument("Living"), "output.create", {
      id: "out_a",
      name: "Projector",
    }).document;
    const assigned = run(oneOutput, "surface.create", {
      id: "sur_a",
      name: "Wall",
    }).document.surfaces.sur_a;
    expect(assigned?.output).toBe("out_a");
    expect(assigned?.mappings.out_a?.corners.topLeft).toEqual({ x: 0, y: 0 });
    expect(assigned?.mappings.out_a?.corners.bottomRight).toEqual({
      x: 1,
      y: 1,
    });

    const explicit = run(oneOutput, "surface.create", {
      id: "sur_b",
      name: "Wall",
      output: null,
    }).document.surfaces.sur_b;
    expect(explicit?.output).toBeNull();
    expect(
      executeCommand(registry, oneOutput, "surface.create", {
        name: "Wall",
        output: "out_missing",
      }),
    ).toMatchObject({ ok: false });
  });

  it("assigns Surfaces, keeping dormant mappings per Output", () => {
    let document = emptyDocument("Living");
    for (const name of ["A", "B"]) {
      document = run(document, "output.create", {
        id: `out_${name}`,
        name,
      }).document;
    }
    document = run(document, "surface.create", {
      id: "sur_a",
      name: "Wall",
      output: "out_A",
    }).document;
    document = run(document, "surface.corner.set", {
      surfaceId: "sur_a",
      corner: "topLeft",
      point: { x: 0.2, y: 0.3 },
    }).document;

    const toB = run(document, "surface.assign", {
      surfaceId: "sur_a",
      output: "out_B",
    });
    expect(toB.label).toBe("Assign Surface to Output");
    expect(toB.document.surfaces.sur_a?.output).toBe("out_B");
    expect(Object.keys(toB.document.surfaces.sur_a?.mappings ?? {})).toEqual([
      "out_A",
      "out_B",
    ]);
    expect(applyPatches(toB.document, toB.inverse)).toEqual(document);

    const backToA = run(toB.document, "surface.assign", {
      surfaceId: "sur_a",
      output: "out_A",
    });
    expect(backToA.patches).toHaveLength(1);
    expect(
      backToA.document.surfaces.sur_a?.mappings.out_A?.corners.topLeft,
    ).toEqual({ x: 0.2, y: 0.3 });

    const none = run(backToA.document, "surface.assign", {
      surfaceId: "sur_a",
      output: null,
    });
    expect(none.label).toBe("Unassign Surface");
    expect(none.document.surfaces.sur_a?.output).toBeNull();
    expect(
      executeCommand(registry, none.document, "surface.corner.nudge", {
        surfaceId: "sur_a",
        corner: "topLeft",
        by: { x: 0.1, y: 0 },
      }),
    ).toMatchObject({ ok: false });
  });

  it("moves corners absolutely and relatively under one coalesce key", () => {
    let document = run(emptyDocument("Living"), "output.create", {
      id: "out_a",
      name: "Projector",
    }).document;
    document = run(document, "surface.create", {
      id: "sur_a",
      name: "Wall",
    }).document;
    const corner = (candidate: Document) =>
      candidate.surfaces.sur_a?.mappings.out_a?.corners.bottomLeft;

    const set = run(document, "surface.corner.set", {
      surfaceId: "sur_a",
      corner: "bottomLeft",
      point: { x: 0, y: 1.05 },
    });
    expect(corner(set.document)).toEqual({ x: 0, y: 1.05 });
    expect(set.coalesceKey).toBe("surface.corner:sur_a:bottomLeft");
    expect(applyPatches(set.document, set.inverse)).toEqual(document);

    const nudged = run(set.document, "surface.corner.nudge", {
      surfaceId: "sur_a",
      corner: "bottomLeft",
      by: { x: 0.01, y: -0.05 },
    });
    expect(corner(nudged.document)).toEqual({ x: 0.01, y: 1 });
    expect(nudged.coalesceKey).toBe(set.coalesceKey);
    expect(nudged.label).toBe("Move Surface corner");

    const unchanged = run(nudged.document, "surface.corner.nudge", {
      surfaceId: "sur_a",
      corner: "bottomLeft",
      by: { x: 0, y: 0 },
    });
    expect(unchanged.patches).toEqual([]);
  });

  it("removing an Output unassigns its Surfaces and drops their mappings", () => {
    let document = emptyDocument("Living");
    for (const name of ["A", "B"]) {
      document = run(document, "output.create", {
        id: `out_${name}`,
        name,
      }).document;
    }
    document = run(document, "surface.create", {
      id: "sur_a",
      name: "Wall",
      output: "out_A",
    }).document;
    document = run(document, "surface.assign", {
      surfaceId: "sur_a",
      output: "out_B",
    }).document;
    document = run(document, "surface.create", {
      id: "sur_b",
      name: "Floor",
      output: "out_A",
    }).document;

    const removed = run(document, "output.remove", { outputId: "out_A" });
    expect(removed.document.outputs.out_A).toBeUndefined();
    expect(removed.document.surfaces.sur_a).toMatchObject({
      output: "out_B",
      mappings: { out_B: expect.anything() as unknown },
    });
    expect(removed.document.surfaces.sur_a?.mappings.out_A).toBeUndefined();
    expect(removed.document.surfaces.sur_b).toMatchObject({
      output: null,
      mappings: {},
    });
    expect(applyPatches(removed.document, removed.inverse)).toEqual(document);

    const gone = run(removed.document, "surface.remove", {
      surfaceId: "sur_b",
    });
    expect(gone.document.surfaces.sur_b).toBeUndefined();
    expect(applyPatches(gone.document, gone.inverse)).toEqual(removed.document);
  });

  function withSurface(): Document {
    let document = run(emptyDocument("Living"), "output.create", {
      id: "out_a",
      name: "Projector",
    }).document;
    document = run(document, "surface.create", {
      id: "sur_a",
      name: "Wall",
    }).document;
    return run(document, "surface.create", {
      id: "sur_b",
      name: "Floor",
    }).document;
  }

  it("creates Masks as inset include rectangles, named and ordered per Surface", () => {
    const first = run(withSurface(), "mask.create", {
      id: "mask_a",
      surfaceId: "sur_a",
      name: "Outlet",
    });
    expect(first.document.masks.mask_a).toEqual({
      id: "mask_a",
      name: "Outlet",
      surfaceId: "sur_a",
      mode: "include",
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.9, y: 0.1 },
        { x: 0.9, y: 0.9 },
        { x: 0.1, y: 0.9 },
      ],
      feather: 0,
      order: "a0",
    });
    expect(first.label).toBe("Create Mask “Outlet”");

    // Names and order keys are scoped to the Surface, not the whole table.
    const sameSurface = run(first.document, "mask.create", {
      id: "mask_b",
      surfaceId: "sur_a",
      name: "Outlet",
    });
    expect(sameSurface.document.masks.mask_b).toMatchObject({
      name: "Outlet 1",
      order: "a1",
    });
    const otherSurface = run(sameSurface.document, "mask.create", {
      id: "mask_c",
      surfaceId: "sur_b",
      name: "Outlet",
    });
    expect(otherSurface.document.masks.mask_c).toMatchObject({
      name: "Outlet",
      order: "a0",
    });
    expect(
      executeCommand(registry, first.document, "mask.create", {
        surfaceId: "sur_missing",
        name: "x",
      }),
    ).toMatchObject({ ok: false });

    const renamed = run(otherSurface.document, "mask.rename", {
      maskId: "mask_b",
      name: "outlet",
    });
    expect(renamed.document.masks.mask_b?.name).toBe("outlet 1");
    const updated = run(renamed.document, "mask.update", {
      maskId: "mask_a",
      mode: "exclude",
      feather: 0.05,
    });
    expect(updated.document.masks.mask_a).toMatchObject({
      mode: "exclude",
      feather: 0.05,
    });
    expect(updated.patches).toHaveLength(2);
    expect(applyPatches(updated.document, updated.inverse)).toEqual(
      renamed.document,
    );
  });

  it("moves Masks only among the Masks of their Surface", () => {
    let document = withSurface();
    for (const [id, surfaceId] of [
      ["mask_a", "sur_a"],
      ["mask_b", "sur_a"],
      ["mask_c", "sur_b"],
    ] as const) {
      document = run(document, "mask.create", {
        id,
        surfaceId,
        name: id,
      }).document;
    }
    const moved = run(document, "entity.move", {
      table: "masks",
      id: "mask_b",
      after: null,
    });
    expect(moved.label).toBe("Move Mask");
    expect(
      orderedEntries(moved.document.masks)
        .filter((mask) => mask.surfaceId === "sur_a")
        .map((mask) => mask.id),
    ).toEqual(["mask_b", "mask_a"]);
    expect(
      executeCommand(registry, document, "entity.move", {
        table: "masks",
        id: "mask_a",
        after: "mask_c",
      }),
    ).toMatchObject({ ok: false });
  });

  it("edits Mask points within the point limits", () => {
    const start = run(withSurface(), "mask.create", {
      id: "mask_a",
      surfaceId: "sur_a",
      name: "Outlet",
    }).document;
    const points = (candidate: Document) => candidate.masks.mask_a?.points;

    const set = run(start, "mask.point.set", {
      maskId: "mask_a",
      index: 1,
      point: { x: 0.95, y: 0.2 },
    });
    expect(points(set.document)?.[1]).toEqual({ x: 0.95, y: 0.2 });
    expect(set.coalesceKey).toBe("mask.point:mask_a:1");
    const nudged = run(set.document, "mask.point.nudge", {
      maskId: "mask_a",
      index: 1,
      by: { x: 0.01, y: 0 },
    });
    expect(points(nudged.document)?.[1]).toEqual({ x: 0.96, y: 0.2 });
    expect(nudged.coalesceKey).toBe(set.coalesceKey);
    expect(applyPatches(nudged.document, nudged.inverse)).toEqual(set.document);

    const added = run(nudged.document, "mask.point.add", {
      maskId: "mask_a",
      after: 3,
    });
    expect(points(added.document)).toHaveLength(5);
    // Halfway along the closing edge, from the last point back to the first.
    expect(points(added.document)?.[4]).toEqual({ x: 0.1, y: 0.5 });

    const removed = run(added.document, "mask.point.remove", {
      maskId: "mask_a",
      index: 4,
    });
    expect(points(removed.document)).toEqual(points(nudged.document));

    let minimal = removed.document;
    minimal = run(minimal, "mask.point.remove", {
      maskId: "mask_a",
      index: 0,
    }).document;
    expect(points(minimal)).toHaveLength(3);
    expect(
      executeCommand(registry, minimal, "mask.point.remove", {
        maskId: "mask_a",
        index: 0,
      }),
    ).toMatchObject({ ok: false });
    expect(
      executeCommand(registry, minimal, "mask.point.set", {
        maskId: "mask_a",
        index: 3,
        point: { x: 0, y: 0 },
      }),
    ).toMatchObject({ ok: false });

    let full = minimal;
    while ((points(full)?.length ?? 0) < 16) {
      full = run(full, "mask.point.add", {
        maskId: "mask_a",
        after: 0,
      }).document;
    }
    expect(
      executeCommand(registry, full, "mask.point.add", {
        maskId: "mask_a",
        after: 0,
      }),
    ).toMatchObject({ ok: false });
  });

  it("removing a Surface removes its Masks", () => {
    let document = withSurface();
    document = run(document, "mask.create", {
      id: "mask_a",
      surfaceId: "sur_a",
      name: "A",
    }).document;
    document = run(document, "mask.create", {
      id: "mask_c",
      surfaceId: "sur_b",
      name: "C",
    }).document;
    const removed = run(document, "surface.remove", { surfaceId: "sur_a" });
    expect(Object.keys(removed.document.masks)).toEqual(["mask_c"]);
    expect(applyPatches(removed.document, removed.inverse)).toEqual(document);
    const gone = run(removed.document, "mask.remove", { maskId: "mask_c" });
    expect(gone.document.masks).toEqual({});
  });

  it("rejects malformed payloads before apply runs", () => {
    const result = executeCommand(
      registry,
      emptyDocument("x"),
      "output.create",
      { name: "" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Invalid payload");
  });

  it("writes performance values through addresses", () => {
    const start = emptyDocument("Living");
    const on = run(start, "address.set", {
      address: "installation/blackout",
      value: true,
    });
    expect(on.document.operational.blackout).toBe(true);
    expect(on.definition.kind).toBe("performance");

    const wrongType = executeCommand(registry, start, "address.set", {
      address: "installation/blackout",
      value: 1,
    });
    expect(wrongType.ok).toBe(false);

    const toggled = run(on.document, "address.toggle", {
      address: "installation/blackout",
    });
    expect(toggled.document.operational.blackout).toBe(false);
  });

  it("produces no patches for a no-op", () => {
    const start = emptyDocument("Living");
    const same = run(start, "installation.rename", { name: "Living" });
    expect(same.patches).toEqual([]);
    expect(same.document).toBe(start);
  });
});
