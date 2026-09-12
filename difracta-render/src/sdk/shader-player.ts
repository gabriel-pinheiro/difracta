import { sameAddressValue, type ParameterValues } from "@difracta/core";

import { disposeQuietly, toError } from "./failure.ts";
import { resolveParameters } from "./parameters.ts";
import { pathTracker, type PathShapes } from "./path.ts";
import { createRandom } from "./random.ts";
import type { ShaderVisual, ShaderVisualInstance } from "./shader-visual.ts";
import type { Uniforms } from "./uniforms.ts";
import { MAX_FRAME_SECONDS } from "./visual.ts";

/**
 * Runs one shader Visual instance: creates it on the first frame, detects
 * Parameter and Path changes, clamps time, carries uniforms across frames
 * and delivers Cues. No GPU is involved, so a shader Visual's behaviour is
 * tested frame by frame like a canvas Visual's. A Visual without `create`
 * still reports a Path edit as a change, since its fragment reads the Path.
 * An instance that throws is disposed and never called again: every later
 * frame is blank and carries the failure.
 */
export interface ShaderPlayer {
  frame(
    dt: number,
    values: ParameterValues,
    width: number,
    height: number,
    paths?: PathShapes,
  ): ShaderFrameResult;
  cue(key: string): void;
  dispose(): void;
}

export interface ShaderFrameResult {
  /** Nothing to draw; the Layer is skipped. */
  readonly blank: boolean;
  /** The picture differs from last frame's, so the frame must be recomposited. */
  readonly changed: boolean;
  readonly uniforms: Uniforms;
  /** The error that stopped the instance; set on every frame from then on. */
  readonly failure?: Error;
}

const NO_UNIFORMS: Uniforms = {};

export function createShaderPlayer(
  visual: ShaderVisual,
  {
    width,
    height,
    seed,
  }: {
    readonly width: number;
    readonly height: number;
    readonly seed: number | string;
  },
): ShaderPlayer {
  let instance: ShaderVisualInstance<typeof visual.parameters> | undefined;
  let previous: ParameterValues | undefined;
  let uniforms = NO_UNIFORMS;
  let wasBlank: boolean | undefined;
  let failure: Error | undefined;
  const tracker = pathTracker();
  const fail = (error: unknown): ShaderFrameResult => {
    failure = toError(error);
    disposeQuietly(instance);
    instance = undefined;
    // The Layer goes blank now; the frames after this one are unchanged.
    const changed = wasBlank !== true;
    wasBlank = true;
    return { blank: true, changed, uniforms, failure };
  };
  return {
    frame(dt, values, frameWidth, frameHeight, shapes = {}) {
      if (failure !== undefined)
        return { blank: true, changed: false, uniforms, failure };
      const params = resolveParameters(visual.parameters, values);
      const { paths, changed: pathsChanged } = tracker.resolve(
        shapes,
        frameWidth,
        frameHeight,
      );
      const changed =
        previous === undefined ||
        pathsChanged ||
        Object.keys(params).some(
          (name) => !sameAddressValue(params[name], previous?.[name]),
        );
      previous = params;
      try {
        instance ??= visual.create?.({
          width,
          height,
          params,
          paths,
          random: createRandom(seed),
        });
        const current = instance;
        if (current === undefined) return { blank: false, changed, uniforms };
        const report =
          current.update({
            dt: Math.min(MAX_FRAME_SECONDS, Math.max(0, dt)),
            params,
            paths,
            width: frameWidth,
            height: frameHeight,
            changed,
          }) ?? {};
        if (report.uniforms !== undefined)
          uniforms = { ...uniforms, ...report.uniforms };
        const blank = report.blank ?? false;
        const flipped = wasBlank !== undefined && blank !== wasBlank;
        wasBlank = blank;
        return {
          blank,
          changed: (report.changed ?? true) || flipped,
          uniforms,
        };
      } catch (error: unknown) {
        return fail(error);
      }
    },
    cue(key) {
      try {
        instance?.cue?.(key);
      } catch (error: unknown) {
        fail(error);
      }
    },
    dispose() {
      instance?.dispose?.();
      instance = undefined;
    },
  };
}
