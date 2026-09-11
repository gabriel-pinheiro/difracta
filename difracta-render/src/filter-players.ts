import type { Catalog, ParameterValues } from "@difracta/core";

import type { FilterDraw } from "./plan.ts";
import {
  isShaderFilter,
  type ShaderFilter,
  type Uniforms,
} from "./sdk/filter.ts";
import { createFilterPlayer, type FilterPlayer } from "./sdk/filter-player.ts";
import { resolveParameters } from "./sdk/parameters.ts";

/** One Filter pass to run this frame, with everything its program needs. */
export interface FilterPass {
  readonly draw: FilterDraw;
  readonly filter: ShaderFilter;
  /** The Layer's values completed with the schema defaults. */
  readonly params: ParameterValues;
  readonly uniforms: Uniforms;
}

export interface FilterStepReport {
  /** Passes to run, in plan order; identity passes are left out. */
  readonly passes: readonly FilterPass[];
  /** True when any Filter would change the picture, so the frame must be recomposited. */
  readonly changed: boolean;
  /** Filters in the plan, Filters with a runnable instance, passes to run. */
  readonly planned: number;
  readonly running: number;
  readonly executed: number;
}

interface Entry {
  readonly filter: string;
  readonly player: FilterPlayer;
}

/**
 * The Filter instances of one Output, one per planned Filter Layer. An
 * instance exists exactly while its Layer is in the plan, like a Visual's,
 * and a change of Filter replaces it. No GPU here: this decides which
 * passes run and with what; the chain runs them.
 */
export class FilterPlayers {
  readonly #catalog: Catalog;
  readonly #entries = new Map<string, Entry>();

  constructor(catalog: Catalog) {
    this.#catalog = catalog;
  }

  step(
    draws: readonly FilterDraw[],
    dt: number,
    width: number,
    height: number,
  ): FilterStepReport {
    const passes: FilterPass[] = [];
    const seen = new Set<string>();
    let changed = false;
    let running = 0;
    for (const draw of draws) {
      const definition = this.#catalog.filter(draw.filter);
      if (definition === undefined || !isShaderFilter(definition)) continue;
      seen.add(draw.layer.id);
      const entry = this.#entry(draw, definition, width, height);
      running += 1;
      const result = entry.player.frame(
        dt,
        draw.layer.parameters,
        width,
        height,
      );
      if (result.changed) changed = true;
      if (result.identity) continue;
      passes.push({
        draw,
        filter: definition,
        params: resolveParameters(definition.parameters, draw.layer.parameters),
        uniforms: result.uniforms,
      });
    }
    for (const [id, entry] of this.#entries) {
      if (seen.has(id)) continue;
      entry.player.dispose();
      this.#entries.delete(id);
      changed = true;
    }
    return {
      passes,
      changed,
      planned: draws.length,
      running,
      executed: passes.length,
    };
  }

  dispose(): void {
    for (const entry of this.#entries.values()) entry.player.dispose();
    this.#entries.clear();
  }

  #entry(
    draw: FilterDraw,
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
    };
    this.#entries.set(draw.layer.id, entry);
    return entry;
  }
}
