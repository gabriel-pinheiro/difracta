import type { ParameterSchema, VisualDefinition } from "@difracta/core";

import type { ParameterValuesOf } from "./parameters.ts";
import type { Random } from "./random.ts";

/**
 * The Visual SDK. A Visual is a definition (what the Catalog lists) plus
 * `create`, which makes one instance per Layer per Output. An instance
 * keeps its own state and integrates its own clocks from the frame's
 * `dt`, so a Parameter change alters what happens next and never where
 * things are now. There is no absolute time anywhere in the contract.
 */

/** Frames longer than this are clamped: a tab that slept does not fast-forward. */
export const MAX_FRAME_SECONDS = 0.1;

export interface VisualContext<S extends ParameterSchema> {
  readonly width: number;
  readonly height: number;
  readonly params: ParameterValuesOf<S>;
  readonly random: Random;
}

export interface VisualFrame<S extends ParameterSchema> {
  /** Seconds since the previous update, clamped to `MAX_FRAME_SECONDS`. */
  readonly dt: number;
  readonly params: ParameterValuesOf<S>;
  readonly width: number;
  readonly height: number;
  /** True when a Parameter differs from the previous frame's, and on the first frame. */
  readonly changed: boolean;
}

export interface VisualCanvas<S extends ParameterSchema> {
  readonly context: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
  readonly params: ParameterValuesOf<S>;
}

/**
 * What an update reports. Not `changed` means the previous drawing is
 * still right, so the Layer's canvas is reused and nothing is uploaded;
 * `blank` means there is nothing to draw at all, so the Layer is skipped
 * entirely. Both default to the safe answer: changed, not blank.
 */
export interface UpdateResult {
  readonly changed?: boolean;
  readonly blank?: boolean;
}

export interface VisualInstance<S extends ParameterSchema> {
  /** Advance state by one frame. Returning nothing means changed and not blank. */
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- an update with nothing to report returns nothing
  update(frame: VisualFrame<S>): UpdateResult | void;
  /** Draw the current state. The canvas is cleared before each call. */
  render(canvas: VisualCanvas<S>): void;
  /** A Cue the Visual declares was fired on this Layer; arrives before the next update. */
  cue?(key: string): void;
  dispose?(): void;
}

export interface CanvasVisual<
  S extends ParameterSchema = ParameterSchema,
> extends VisualDefinition {
  readonly backend: "canvas";
  readonly parameters: S;
  create(context: VisualContext<S>): VisualInstance<S>;
}

/** Declares a canvas Visual; the Parameter schema types `params` everywhere. */
export function defineVisual<const S extends ParameterSchema>(
  visual: Omit<CanvasVisual<S>, "kind" | "backend">,
): CanvasVisual<S> {
  return { ...visual, kind: "visual", backend: "canvas" };
}

/** A definition the Catalog lists that can also be instantiated here. */
export function isCanvasVisual(
  definition: VisualDefinition,
): definition is CanvasVisual {
  return definition.backend === "canvas" && "create" in definition;
}
