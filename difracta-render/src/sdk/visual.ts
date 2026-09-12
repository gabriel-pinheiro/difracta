import type {
  ParameterSchema,
  PathRequirement,
  VisualDefinition,
} from "@difracta/core";

import type { ParameterValuesOf } from "./parameters.ts";
import type { PathGeometry } from "./path.ts";
import type { Random } from "./random.ts";

/**
 * The Visual SDK. A Visual is a definition (what the Catalog lists) plus
 * `create`, which makes one instance per Layer per Output. An instance
 * keeps its own state and integrates its own clocks from the frame's
 * `dt`, so a Parameter change alters what happens next and never where
 * things are now. There is no absolute time anywhere in the contract.
 * The Paths a Visual declares arrive resolved to pixels under their keys,
 * in the context, in every frame and in every render, and never missing:
 * a Layer with a Path unbound is not run at all.
 */

/** Frames longer than this are clamped: a tab that slept does not fast-forward. */
export const MAX_FRAME_SECONDS = 0.1;

export type PathRequirements = readonly PathRequirement[];

/** The declared Paths by key, each as pixel geometry. */
export type PathsOf<P extends PathRequirements> = Readonly<
  Record<P[number]["key"], PathGeometry>
>;

export interface VisualContext<
  S extends ParameterSchema,
  P extends PathRequirements = PathRequirements,
> {
  readonly width: number;
  readonly height: number;
  readonly params: ParameterValuesOf<S>;
  readonly paths: PathsOf<P>;
  readonly random: Random;
}

export interface VisualFrame<
  S extends ParameterSchema,
  P extends PathRequirements = PathRequirements,
> {
  /** Seconds since the previous update, clamped to `MAX_FRAME_SECONDS`. */
  readonly dt: number;
  readonly params: ParameterValuesOf<S>;
  readonly paths: PathsOf<P>;
  readonly width: number;
  readonly height: number;
  /** True when a Parameter or a Path differs from the previous frame's, and on the first frame. */
  readonly changed: boolean;
}

export interface VisualCanvas<
  S extends ParameterSchema,
  P extends PathRequirements = PathRequirements,
> {
  readonly context: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
  readonly params: ParameterValuesOf<S>;
  readonly paths: PathsOf<P>;
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

export interface VisualInstance<
  S extends ParameterSchema,
  P extends PathRequirements = PathRequirements,
> {
  /** Advance state by one frame. Returning nothing means changed and not blank. */
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- an update with nothing to report returns nothing
  update(frame: VisualFrame<S, P>): UpdateResult | void;
  /** Draw the current state. The canvas is cleared before each call. */
  render(canvas: VisualCanvas<S, P>): void;
  /** A Cue the Visual declares was fired on this Layer; arrives before the next update. */
  cue?(key: string): void;
  dispose?(): void;
}

export interface CanvasVisual<
  S extends ParameterSchema = ParameterSchema,
  P extends PathRequirements = PathRequirements,
> extends VisualDefinition {
  readonly backend: "canvas";
  readonly parameters: S;
  readonly paths?: P;
  create(context: VisualContext<S, P>): VisualInstance<S, P>;
}

/** Declares a canvas Visual; the Parameter schema types `params` and the Paths type `paths` everywhere. */
export function defineVisual<
  const S extends ParameterSchema,
  const P extends PathRequirements = readonly [],
>(visual: Omit<CanvasVisual<S, P>, "kind" | "backend">): CanvasVisual<S, P> {
  return { ...visual, kind: "visual", backend: "canvas" };
}

/** A definition the Catalog lists that can also be instantiated here. */
export function isCanvasVisual(
  definition: VisualDefinition,
): definition is CanvasVisual {
  return definition.backend === "canvas" && "create" in definition;
}
