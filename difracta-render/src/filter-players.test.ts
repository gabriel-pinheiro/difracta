import { Catalog, type FilterLayer } from "@difracta/core";
import { describe, expect, it } from "vitest";

import {
  FilterPlayers,
  passesWithInput,
  type RootFilterPass,
} from "./filter-players.ts";
import type { LayerDraw } from "./plan.ts";
import { defineFilter } from "./sdk/filter.ts";

const pass = (below: number): RootFilterPass =>
  ({ draw: { below } }) as unknown as RootFilterPass;
const frame = (index: number) => ({ index });

describe("passesWithInput", () => {
  it("runs a pass only when a Layer below it drew this frame", () => {
    const passes = [pass(1), pass(2), pass(3)];
    // Nothing drew: no pass, so the chain is never begun.
    expect(passesWithInput(passes, [])).toEqual([]);
    // Only the second Layer drew: the pass right above the first is skipped.
    expect(passesWithInput(passes, [frame(1), frame(2)])).toEqual([
      pass(2),
      pass(3),
    ]);
    expect(passesWithInput(passes, [frame(0)])).toEqual(passes);
    expect(passesWithInput(passes, [frame(2)])).toEqual([pass(3)]);
  });
});

/** Records the sizes its instances were created with and stepped at; identity when Amount is zero. */
const sizes: { created: number[][]; stepped: number[][] } = {
  created: [],
  stepped: [],
};
const fade = defineFilter({
  id: "fade",
  name: "Fade",
  description: "Scales the picture by Amount.",
  parameters: {
    amount: { kind: "number", label: "Amount", default: 1, min: 0, max: 1 },
  },
  fragment: `vec4 filter_image(vec2 uv) { return sample_input(uv) * u_amount; }`,
  create({ width, height }) {
    sizes.created.push([width, height]);
    return {
      update({ width, height, params, changed }) {
        sizes.stepped.push([width, height]);
        return { changed, identity: params.amount <= 0 };
      },
    };
  },
});
const catalog = new Catalog({ visuals: [], filters: [fade] });

function filterLayer(id: string, amount = 1): FilterLayer {
  return {
    id: id as FilterLayer["id"],
    kind: "filter",
    name: id,
    sceneId: "s",
    parentId: "A",
    enabled: true,
    order: "a",
    filter: "fade",
    parameters: { amount },
    mix: 1,
  };
}

/** A Visual Layer draw with the given Filters, bottom first; only what the players read. */
function layerDraw(
  id: string,
  filters: readonly FilterLayer[],
  hidden = false,
): LayerDraw {
  return {
    layer: { id },
    hidden,
    filters: filters.map((layer) => ({ layer, filter: "fade" })),
  } as unknown as LayerDraw;
}

describe("FilterPlayers with a Visual Layer's Filters", () => {
  it("gives a nested instance its Layer's Target buffer size, not the frame's", () => {
    sizes.created.length = 0;
    sizes.stepped.length = 0;
    const players = new FilterPlayers(catalog);
    const report = players.step(
      [],
      [layerDraw("A", [filterLayer("f")])],
      0.016,
      1920,
      1080,
      () => ({ width: 300, height: 200 }),
    );
    expect(sizes.created).toEqual([[300, 200]]);
    expect(sizes.stepped).toEqual([[300, 200]]);
    expect(report.planned).toBe(1);
    expect(report.running).toBe(1);
    expect(report.nested.get("A")?.passes.map((p) => p.layer.id)).toEqual([
      "f",
    ]);
    expect(report.nested.get("A")?.changed).toBe(true);
    expect(report.passes).toEqual([]);
    players.dispose();
  });

  it("leaves a Layer on the plain path when its only Filter is identity, and notices the chain change", () => {
    const players = new FilterPlayers(catalog);
    const size = () => ({ width: 10, height: 10 });
    const first = players.step(
      [],
      [layerDraw("A", [filterLayer("f", 0)])],
      0.016,
      100,
      100,
      size,
    );
    expect(first.nested.get("A")?.passes).toEqual([]);
    expect(first.planned).toBe(1);
    // Nothing changed on the second frame, so the kept picture stands.
    const second = players.step(
      [],
      [layerDraw("A", [filterLayer("f", 0)])],
      0.016,
      100,
      100,
      size,
    );
    expect(second.nested.get("A")?.changed).toBe(false);
    expect(second.changed).toBe(false);
    // Turning the Amount up makes a pass, and a change.
    const third = players.step(
      [],
      [layerDraw("A", [filterLayer("f", 0.5)])],
      0.016,
      100,
      100,
      size,
    );
    expect(third.nested.get("A")?.passes).toHaveLength(1);
    expect(third.nested.get("A")?.changed).toBe(true);
    // Adding a second Filter changes the chain even if neither pass does.
    const fourth = players.step(
      [],
      [layerDraw("A", [filterLayer("f", 0.5), filterLayer("g", 0.5)])],
      0.016,
      100,
      100,
      size,
    );
    expect(fourth.nested.get("A")?.changed).toBe(true);
    players.dispose();
  });

  it("keeps a hidden Layer's instances without stepping them, and drops them with the Layer", () => {
    sizes.created.length = 0;
    sizes.stepped.length = 0;
    const players = new FilterPlayers(catalog);
    const size = () => ({ width: 10, height: 10 });
    players.step([], [layerDraw("A", [filterLayer("f")])], 0.016, 1, 1, size);
    const hidden = players.step(
      [],
      [layerDraw("A", [filterLayer("f")], true)],
      0.016,
      1,
      1,
      size,
    );
    expect(hidden.planned).toBe(1);
    expect(hidden.running).toBe(0);
    expect(hidden.nested.has("A")).toBe(false);
    expect(sizes.stepped).toHaveLength(1);
    // Shown again: the same instance steps on, not a new one.
    players.step([], [layerDraw("A", [filterLayer("f")])], 0.016, 1, 1, size);
    expect(sizes.created).toHaveLength(1);
    expect(sizes.stepped).toHaveLength(2);
    // The Layer leaves the plan: the instance goes, which is a change.
    const gone = players.step([], [], 0.016, 1, 1, size);
    expect(gone.changed).toBe(true);
    players.step([], [layerDraw("A", [filterLayer("f")])], 0.016, 1, 1, size);
    expect(sizes.created).toHaveLength(2);
    players.dispose();
  });
});
