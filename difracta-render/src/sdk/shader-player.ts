import { sameAddressValue, type ParameterValues } from "@difracta/core";

import { resolveParameters } from "./parameters.ts";
import { createRandom } from "./random.ts";
import type { ShaderVisual, ShaderVisualInstance } from "./shader-visual.ts";
import type { Uniforms } from "./uniforms.ts";
import { MAX_FRAME_SECONDS } from "./visual.ts";

/**
 * Runs one shader Visual instance: creates it on the first frame, detects
 * Parameter changes, clamps time, carries uniforms across frames and
 * delivers Cues. No GPU is involved, so a shader Visual's behaviour is
 * tested frame by frame like a canvas Visual's.
 */
export interface ShaderPlayer {
  frame(
    dt: number,
    values: ParameterValues,
    width: number,
    height: number,
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
  const create = (values: ParameterValues) => {
    instance ??= visual.create?.({
      width,
      height,
      params: resolveParameters(visual.parameters, values),
      random: createRandom(seed),
    });
    return instance;
  };
  return {
    frame(dt, values, frameWidth, frameHeight) {
      const params = resolveParameters(visual.parameters, values);
      const changed =
        previous === undefined ||
        Object.keys(params).some(
          (name) => !sameAddressValue(params[name], previous?.[name]),
        );
      previous = params;
      const current = create(values);
      if (current === undefined) return { blank: false, changed, uniforms };
      const report =
        current.update({
          dt: Math.min(MAX_FRAME_SECONDS, Math.max(0, dt)),
          params,
          width: frameWidth,
          height: frameHeight,
          changed,
        }) ?? {};
      if (report.uniforms !== undefined)
        uniforms = { ...uniforms, ...report.uniforms };
      const blank = report.blank ?? false;
      const flipped = wasBlank !== undefined && blank !== wasBlank;
      wasBlank = blank;
      return { blank, changed: (report.changed ?? true) || flipped, uniforms };
    },
    cue(key) {
      instance?.cue?.(key);
    },
    dispose() {
      instance?.dispose?.();
      instance = undefined;
    },
  };
}
