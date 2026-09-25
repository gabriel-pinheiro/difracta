import { sameAddressValue, type ParameterValues } from "@difracta/core";

import { disposeQuietly, toError } from "./failure.ts";
import { NO_MEDIA, type MediaContext, type Textures } from "./media.ts";
import { resolveParameters } from "./parameters.ts";
import { pathTracker, type PathShapes } from "./path.ts";
import { createRandom } from "./random.ts";
import type { ShaderVisual, ShaderVisualInstance } from "./shader-visual.ts";
import type { Uniforms } from "./uniforms.ts";
import { MAX_FRAME_SECONDS } from "./visual.ts";

/**
 * Runs one shader Visual instance: creates it on the first frame, detects
 * Parameter and Path changes, clamps time, carries uniforms and textures
 * across frames, delivers Cues and tells the instance when its Layer is
 * hidden and shown again. No GPU is involved, so a shader Visual's
 * behaviour is tested frame by frame like a canvas Visual's. A Visual
 * without `create` still reports a Path edit as a change, since its
 * fragment reads the Path. An instance that throws is disposed and never
 * called again: every later frame is blank and carries the failure.
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
  /** The Layer is at opacity zero: no frames until it shows again, which the next `frame` says. */
  hide(): void;
  dispose(): void;
}

export interface ShaderFrameResult {
  /** Nothing to draw; the Layer is skipped. */
  readonly blank: boolean;
  /** The picture differs from last frame's, so the frame must be recomposited. */
  readonly changed: boolean;
  readonly uniforms: Uniforms;
  /** The Media handles the fragment samples, kept like the uniforms. */
  readonly textures: Textures;
  /** The resolution the instance last asked for (see `ShaderUpdate`), 1 until it asks. */
  readonly resolution: number;
  /** The error that stopped the instance; set on every frame from then on. */
  readonly failure?: Error;
}

const NO_UNIFORMS: Uniforms = {};
const NO_TEXTURES: Textures = {};

export function createShaderPlayer(
  visual: ShaderVisual,
  {
    width,
    height,
    seed,
    media = NO_MEDIA,
  }: {
    readonly width: number;
    readonly height: number;
    readonly seed: number | string;
    readonly media?: MediaContext;
  },
): ShaderPlayer {
  let instance: ShaderVisualInstance<typeof visual.parameters> | undefined;
  let previous: ParameterValues | undefined;
  let uniforms = NO_UNIFORMS;
  let textures = NO_TEXTURES;
  let resolution = 1;
  let wasBlank: boolean | undefined;
  let hidden = false;
  let failure: Error | undefined;
  const tracker = pathTracker();
  const fail = (error: unknown): ShaderFrameResult => {
    failure = toError(error);
    disposeQuietly(instance);
    instance = undefined;
    // The Layer goes blank now; the frames after this one are unchanged.
    const changed = wasBlank !== true;
    wasBlank = true;
    return { blank: true, changed, uniforms, textures, resolution, failure };
  };
  return {
    frame(dt, values, frameWidth, frameHeight, shapes = {}) {
      if (failure !== undefined)
        return {
          blank: true,
          changed: false,
          uniforms,
          textures,
          resolution,
          failure,
        };
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
          media,
        });
        const current = instance;
        if (current === undefined)
          return { blank: false, changed, uniforms, textures, resolution };
        if (hidden) {
          hidden = false;
          current.shown?.();
        }
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
        if (report.textures !== undefined)
          textures = { ...textures, ...report.textures };
        if (report.resolution !== undefined) resolution = report.resolution;
        const blank = report.blank ?? false;
        const flipped = wasBlank !== undefined && blank !== wasBlank;
        wasBlank = blank;
        return {
          blank,
          changed: (report.changed ?? true) || flipped,
          uniforms,
          textures,
          resolution,
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
    hide() {
      if (hidden || instance === undefined) return;
      hidden = true;
      try {
        instance.hidden?.();
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
