import { sameAddressValue, type ParameterValues } from "@difracta/core";

import { disposeQuietly, toError } from "./failure.ts";
import { NO_MEDIA, type MediaContext } from "./media.ts";
import { resolveParameters } from "./parameters.ts";
import { pathTracker, type PathShapes } from "./path.ts";
import { createRandom } from "./random.ts";
import {
  MAX_FRAME_SECONDS,
  type CanvasVisual,
  type VisualInstance,
} from "./visual.ts";

/**
 * Runs one Visual instance on one canvas: creates it on the first frame,
 * detects Parameter and Path changes, clamps time, tells the instance when
 * its Layer is hidden and shown again, and turns the instance's update
 * report into whether the canvas was redrawn or should be skipped. The
 * Output owns the canvas and calls `frame` once per animation frame.
 * An instance that throws (in `create`, `update`, `render` or `cue`) is
 * disposed and never called again: every later frame is blank and carries
 * the failure, so the Output can report it and draw the other Layers.
 */
export interface VisualPlayer {
  frame(dt: number, values: ParameterValues, paths?: PathShapes): FrameResult;
  /** Delivers a fired Cue to the instance, once there is one. */
  cue(key: string): void;
  /** The Layer is at opacity zero: no frames until it shows again, which the next `frame` says. */
  hide(): void;
  dispose(): void;
}

export interface FrameResult {
  /** The canvas holds a new drawing this frame. */
  readonly rendered: boolean;
  /** Nothing to show; the canvas content is stale and must not be drawn. */
  readonly blank: boolean;
  /** The error that stopped the instance; set on every frame from then on. */
  readonly failure?: Error;
}

export function createVisualPlayer(
  visual: CanvasVisual,
  {
    context,
    width,
    height,
    seed,
    media = NO_MEDIA,
  }: {
    readonly context: CanvasRenderingContext2D;
    readonly width: number;
    readonly height: number;
    /** Typically the Layer id, so the Layer looks the same on every run. */
    readonly seed: number | string;
    readonly media?: MediaContext;
  },
): VisualPlayer {
  let instance: VisualInstance<typeof visual.parameters> | undefined;
  let previous: ParameterValues | undefined;
  let needsRedraw = true;
  let hidden = false;
  let failure: Error | undefined;
  const tracker = pathTracker();
  let paths: ReturnType<typeof tracker.resolve>["paths"] = {};
  const fail = (error: unknown): FrameResult => {
    failure = toError(error);
    disposeQuietly(instance);
    instance = undefined;
    return { rendered: false, blank: true, failure };
  };
  return {
    frame(dt, values, shapes = {}) {
      if (failure !== undefined)
        return { rendered: false, blank: true, failure };
      const params = resolveParameters(visual.parameters, values);
      const resolved = tracker.resolve(shapes, width, height);
      paths = resolved.paths;
      const changed =
        previous === undefined ||
        resolved.changed ||
        Object.keys(params).some(
          (name) => !sameAddressValue(params[name], previous?.[name]),
        );
      previous = params;
      try {
        instance ??= visual.create({
          width,
          height,
          params,
          paths,
          random: createRandom(seed),
          media,
        });
        if (hidden) {
          hidden = false;
          instance.shown?.();
        }
        const report =
          instance.update({
            dt: Math.min(MAX_FRAME_SECONDS, Math.max(0, dt)),
            params,
            paths,
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
        try {
          context.setTransform(1, 0, 0, 1, 0, 0);
          context.clearRect(0, 0, width, height);
          instance.render({ context, width, height, params, paths });
        } finally {
          context.restore();
        }
        needsRedraw = false;
        return { rendered: true, blank: false };
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
