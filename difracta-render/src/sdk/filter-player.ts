import { sameAddressValue, type ParameterValues } from "@difracta/core";

import type { FilterInstance, ShaderFilter, Uniforms } from "./filter.ts";
import { resolveParameters } from "./parameters.ts";
import { createRandom } from "./random.ts";
import { MAX_FRAME_SECONDS } from "./visual.ts";

/**
 * Runs one Filter instance: creates it on the first frame, detects
 * Parameter changes, clamps time, carries uniforms across frames, and
 * turns the instance's report into whether the pass runs and whether the
 * frame must be recomposited. A Filter without `create` is static: it
 * changes only when its Parameters do. No GPU is involved, so a Filter's
 * behaviour is testable frame by frame.
 */
export interface FilterPlayer {
  frame(
    dt: number,
    values: ParameterValues,
    width: number,
    height: number,
  ): FilterResult;
  dispose(): void;
}

export interface FilterResult {
  /** The pass would return its input unchanged, so it is skipped. */
  readonly identity: boolean;
  /** The pass would produce a new picture from the same input. */
  readonly changed: boolean;
  /** The instance's uniforms for this frame, `u_` prefix left off. */
  readonly uniforms: Uniforms;
}

const NO_UNIFORMS: Uniforms = {};

export function createFilterPlayer(
  filter: ShaderFilter,
  {
    width,
    height,
    seed,
  }: {
    readonly width: number;
    readonly height: number;
    /** Typically the Layer id, so the Filter behaves the same on every run. */
    readonly seed: number | string;
  },
): FilterPlayer {
  let instance: FilterInstance<typeof filter.parameters> | undefined;
  let previous: ParameterValues | undefined;
  let uniforms = NO_UNIFORMS;
  let wasIdentity: boolean | undefined;
  return {
    frame(dt, values, frameWidth, frameHeight) {
      const params = resolveParameters(filter.parameters, values);
      const changed =
        previous === undefined ||
        Object.keys(params).some(
          (name) => !sameAddressValue(params[name], previous?.[name]),
        );
      previous = params;
      if (filter.create === undefined)
        return { identity: false, changed, uniforms };
      instance ??= filter.create({
        width,
        height,
        params,
        random: createRandom(seed),
      });
      const report =
        instance.update({
          dt: Math.min(MAX_FRAME_SECONDS, Math.max(0, dt)),
          params,
          width: frameWidth,
          height: frameHeight,
          changed,
        }) ?? {};
      if (report.uniforms !== undefined)
        uniforms = { ...uniforms, ...report.uniforms };
      const identity = report.identity ?? false;
      const flipped = wasIdentity !== undefined && identity !== wasIdentity;
      wasIdentity = identity;
      return {
        identity,
        changed: (report.changed ?? true) || flipped,
        uniforms,
      };
    },
    dispose() {
      instance?.dispose?.();
      instance = undefined;
    },
  };
}
