import type { Catalog, FilterLayer, ParameterValues } from "@difracta/core";

import { reportIssue, type RenderIssue } from "./issues.ts";
import type { LayerFrame } from "./layer-players.ts";
import type { FilterDraw, LayerDraw, NestedFilterDraw } from "./plan.ts";
import { isShaderFilter, type ShaderFilter } from "./sdk/filter.ts";
import { createFilterPlayer, type FilterPlayer } from "./sdk/filter-player.ts";
import { resolveParameters } from "./sdk/parameters.ts";
import type { Uniforms } from "./sdk/uniforms.ts";

/** One Filter pass to run this frame, with everything its program needs. */
export interface FilterPass {
  readonly layer: FilterLayer;
  readonly filter: ShaderFilter;
  /** The Layer's values completed with the schema defaults. */
  readonly params: ParameterValues;
  readonly uniforms: Uniforms;
}

/** A pass of a root Filter Layer, placed in the stack by its draw. */
export interface RootFilterPass extends FilterPass {
  readonly draw: FilterDraw;
}

/** A Visual Layer's passes this frame, over its picture in its Target. */
export interface NestedChain {
  /** Bottom first, identity passes left out; may be empty, which is the plain path. */
  readonly passes: readonly FilterPass[];
  /** The chain would give a new picture from the same input: a pass changed, or the Filters did. */
  readonly changed: boolean;
}

export interface FilterStepReport {
  /** Root passes that would change the frame, in plan order; identity passes are left out. */
  readonly passes: readonly RootFilterPass[];
  /** The chains of the Visual Layers that have planned Filters and are not hidden, by Layer id. */
  readonly nested: ReadonlyMap<string, NestedChain>;
  /** True when any Filter would change its picture, so the frame must be recomposited. */
  readonly changed: boolean;
  /** Filters in the plan, root and nested, and Filters with a runnable instance. */
  readonly planned: number;
  readonly running: number;
  /** The Filters whose instance failed, one issue each, on every frame they stay planned. */
  readonly issues: readonly RenderIssue[];
}

/**
 * The root passes that have something to transform: a pass is a
 * full-frame draw, so it runs only when a Layer below it contributed this
 * frame. `frames` are the Layers that drew, in plan order, so the lowest
 * one decides for every pass.
 */
export function passesWithInput(
  passes: readonly RootFilterPass[],
  frames: readonly Pick<LayerFrame, "index">[],
): readonly RootFilterPass[] {
  const lowest = frames[0]?.index;
  if (lowest === undefined) return [];
  return passes.filter((pass) => pass.draw.below > lowest);
}

/** The size a nested Filter's instance is told: its Layer's Target buffer. */
export type LayerSize = (draw: LayerDraw) => {
  readonly width: number;
  readonly height: number;
};

/**
 * A failed entry keeps its key and its place in the map, so its Filter is
 * retried exactly when a live entry would be replaced: the Layer leaves
 * the plan or its Filter changes.
 */
interface Entry {
  readonly filter: string;
  readonly player: FilterPlayer;
  issue: RenderIssue | undefined;
}

/**
 * The Filter instances of one Output, one per planned Filter Layer, root
 * or nested in a Visual Layer, keyed by Layer id. An instance exists
 * exactly while its Layer is in the plan, like a Visual's, and a change of
 * Filter replaces it; a nested one whose Visual Layer is hidden is kept
 * and left alone, like the Visual's. No GPU here: this decides which
 * passes run and with what; the chains run them. An instance that throws
 * is stopped by its player; the Filter is logged once, treated as identity
 * and reported as an issue on every frame until its entry is replaced.
 */
export class FilterPlayers {
  readonly #catalog: Catalog;
  readonly #entries = new Map<string, Entry>();
  /** What each Visual Layer's Filters were last frame, to notice one added, removed, reordered or swapped. */
  readonly #chains = new Map<string, string>();

  constructor(catalog: Catalog) {
    this.#catalog = catalog;
  }

  /**
   * Steps the root Filters with the frame's size and every Visual Layer's
   * Filters with that Layer's Target buffer size (`layerSize`).
   */
  step(
    draws: readonly FilterDraw[],
    layers: readonly LayerDraw[],
    dt: number,
    width: number,
    height: number,
    layerSize: LayerSize,
  ): FilterStepReport {
    const passes: RootFilterPass[] = [];
    const nested = new Map<string, NestedChain>();
    const issues: RenderIssue[] = [];
    const seen = new Set<string>();
    const counts = { planned: draws.length, running: 0 };
    let changed = false;
    for (const draw of draws) {
      const step = this.#step(draw, dt, width, height, seen, counts, issues);
      if (step === undefined) continue;
      changed ||= step.changed;
      if (step.pass !== undefined) passes.push({ ...step.pass, draw });
    }
    const chains = new Set<string>();
    for (const layer of layers) {
      if (layer.filters.length === 0) continue;
      chains.add(layer.layer.id);
      counts.planned += layer.filters.length;
      if (layer.hidden) {
        for (const draw of layer.filters) seen.add(draw.layer.id);
        continue;
      }
      const key = layer.filters
        .map((draw) => `${draw.layer.id}:${draw.filter}`)
        .join(" ");
      let chainChanged = this.#chains.get(layer.layer.id) !== key;
      this.#chains.set(layer.layer.id, key);
      const size = layerSize(layer);
      const chain: FilterPass[] = [];
      for (const draw of layer.filters) {
        const step = this.#step(
          draw,
          dt,
          size.width,
          size.height,
          seen,
          counts,
          issues,
        );
        if (step === undefined) continue;
        chainChanged ||= step.changed;
        if (step.pass !== undefined) chain.push(step.pass);
      }
      nested.set(layer.layer.id, { passes: chain, changed: chainChanged });
      changed ||= chainChanged;
    }
    for (const id of this.#chains.keys())
      if (!chains.has(id)) this.#chains.delete(id);
    for (const [id, entry] of this.#entries) {
      if (seen.has(id)) continue;
      entry.player.dispose();
      this.#entries.delete(id);
      changed = true;
    }
    return {
      passes,
      nested,
      changed,
      planned: counts.planned,
      running: counts.running,
      issues,
    };
  }

  dispose(): void {
    for (const entry of this.#entries.values()) entry.player.dispose();
    this.#entries.clear();
    this.#chains.clear();
  }

  /**
   * Steps one Filter Layer's instance: whether its picture changed, and
   * its pass unless it is identity. Undefined when the Filter cannot run.
   */
  #step(
    draw: NestedFilterDraw,
    dt: number,
    width: number,
    height: number,
    seen: Set<string>,
    counts: { running: number },
    issues: RenderIssue[],
  ): { readonly changed: boolean; readonly pass?: FilterPass } | undefined {
    const definition = this.#catalog.filter(draw.filter);
    if (definition === undefined || !isShaderFilter(definition)) return;
    seen.add(draw.layer.id);
    const entry = this.#entry(draw, definition, width, height);
    if (entry.issue !== undefined) {
      issues.push(entry.issue);
      return { changed: false };
    }
    counts.running += 1;
    const result = entry.player.frame(dt, draw.layer.parameters, width, height);
    if (result.failure !== undefined) {
      // Logged once here; reported on every frame from now on.
      entry.issue = reportIssue(
        "Filter",
        draw.layer,
        draw.filter,
        result.failure,
      );
      issues.push(entry.issue);
    }
    if (result.identity) return { changed: result.changed };
    return {
      changed: result.changed,
      pass: {
        layer: draw.layer,
        filter: definition,
        params: resolveParameters(definition.parameters, draw.layer.parameters),
        uniforms: result.uniforms,
      },
    };
  }

  #entry(
    draw: NestedFilterDraw,
    definition: ShaderFilter,
    width: number,
    height: number,
  ): Entry {
    const current = this.#entries.get(draw.layer.id);
    if (current?.filter === draw.filter) return current;
    current?.player.dispose();
    const entry: Entry = {
      filter: draw.filter,
      player: createFilterPlayer(definition, {
        width,
        height,
        seed: draw.layer.id,
      }),
      issue: undefined,
    };
    this.#entries.set(draw.layer.id, entry);
    return entry;
  }
}
