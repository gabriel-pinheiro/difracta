import type { Catalog, ParameterValues } from "@difracta/core";

import { reportIssue, type RenderIssue } from "./issues.ts";
import type { LayerFrame } from "./layer-players.ts";
import type { FilterDraw } from "./plan.ts";
import { isShaderFilter, type ShaderFilter } from "./sdk/filter.ts";
import { createFilterPlayer, type FilterPlayer } from "./sdk/filter-player.ts";
import { resolveParameters } from "./sdk/parameters.ts";
import type { Uniforms } from "./sdk/uniforms.ts";

/** One Filter pass to run this frame, with everything its program needs. */
export interface FilterPass {
  readonly draw: FilterDraw;
  readonly filter: ShaderFilter;
  /** The Layer's values completed with the schema defaults. */
  readonly params: ParameterValues;
  readonly uniforms: Uniforms;
}

export interface FilterStepReport {
  /** Passes that would change the frame, in plan order; identity passes are left out. */
  readonly passes: readonly FilterPass[];
  /** True when any Filter would change the picture, so the frame must be recomposited. */
  readonly changed: boolean;
  /** Filters in the plan and Filters with a runnable instance. */
  readonly planned: number;
  readonly running: number;
  /** The Filters whose instance failed, one issue each, on every frame they stay planned. */
  readonly issues: readonly RenderIssue[];
}

/**
 * The passes that have something to transform: a pass is a full-frame
 * draw, so it runs only when a Layer below it contributed this frame.
 * `frames` are the Layers that drew, in plan order, so the lowest one
 * decides for every pass.
 */
export function passesWithInput(
  passes: readonly FilterPass[],
  frames: readonly Pick<LayerFrame, "index">[],
): readonly FilterPass[] {
  const lowest = frames[0]?.index;
  if (lowest === undefined) return [];
  return passes.filter((pass) => pass.draw.below > lowest);
}

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
 * The Filter instances of one Output, one per planned Filter Layer. An
 * instance exists exactly while its Layer is in the plan, like a Visual's,
 * and a change of Filter replaces it. No GPU here: this decides which
 * passes run and with what; the chain runs them. An instance that throws
 * is stopped by its player; the Filter is logged once, treated as identity
 * and reported as an issue on every frame until its entry is replaced.
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
    const issues: RenderIssue[] = [];
    const seen = new Set<string>();
    let changed = false;
    let running = 0;
    for (const draw of draws) {
      const definition = this.#catalog.filter(draw.filter);
      if (definition === undefined || !isShaderFilter(definition)) continue;
      seen.add(draw.layer.id);
      const entry = this.#entry(draw, definition, width, height);
      if (entry.issue !== undefined) {
        issues.push(entry.issue);
        continue;
      }
      running += 1;
      const result = entry.player.frame(
        dt,
        draw.layer.parameters,
        width,
        height,
      );
      if (result.changed) changed = true;
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
    return { passes, changed, planned: draws.length, running, issues };
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
      issue: undefined,
    };
    this.#entries.set(draw.layer.id, entry);
    return entry;
  }
}
