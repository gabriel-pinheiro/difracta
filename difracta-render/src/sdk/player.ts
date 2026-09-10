import { sameAddressValue, type ParameterValues } from "@difracta/core";

import { resolveParameters } from "./parameters.ts";
import { createRandom } from "./random.ts";
import {
  MAX_FRAME_SECONDS,
  type CanvasVisual,
  type VisualInstance,
} from "./visual.ts";

/**
 * Runs one Visual instance on one canvas: creates it on the first frame,
 * detects Parameter changes, clamps time, and turns the instance's update
 * report into whether the canvas was redrawn or should be skipped. The
 * Output owns the canvas and calls `frame` once per animation frame.
 */
export interface VisualPlayer {
  frame(dt: number, values: ParameterValues): FrameResult;
  dispose(): void;
}

export interface FrameResult {
  /** The canvas holds a new drawing this frame. */
  readonly rendered: boolean;
  /** Nothing to show; the canvas content is stale and must not be drawn. */
  readonly blank: boolean;
}

export function createVisualPlayer(
  visual: CanvasVisual,
  {
    context,
    width,
    height,
    seed,
  }: {
    readonly context: CanvasRenderingContext2D;
    readonly width: number;
    readonly height: number;
    /** Typically the Layer id, so the Layer looks the same on every run. */
    readonly seed: number | string;
  },
): VisualPlayer {
  let instance: VisualInstance<typeof visual.parameters> | undefined;
  let previous: ParameterValues | undefined;
  let needsRedraw = true;
  return {
    frame(dt, values) {
      const params = resolveParameters(visual.parameters, values);
      const changed =
        previous === undefined ||
        Object.keys(params).some(
          (name) => !sameAddressValue(params[name], previous?.[name]),
        );
      previous = params;
      instance ??= visual.create({
        width,
        height,
        params,
        random: createRandom(seed),
      });
      const report =
        instance.update({
          dt: Math.min(MAX_FRAME_SECONDS, Math.max(0, dt)),
          params,
          width,
          height,
          changed,
        }) ?? {};
      if (report.blank === true) {
        needsRedraw = true;
        return { rendered: false, blank: true };
      }
      if (report.changed === false && !needsRedraw)
        return { rendered: false, blank: false };
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, width, height);
      instance.render({ context, width, height, params });
      context.restore();
      needsRedraw = false;
      return { rendered: true, blank: false };
    },
    dispose() {
      instance?.dispose?.();
      instance = undefined;
    },
  };
}
