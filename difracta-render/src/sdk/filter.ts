import type { FilterDefinition, ParameterSchema } from "@difracta/core";

import type { ParameterValuesOf } from "./parameters.ts";
import type { Random } from "./random.ts";
import type { Uniforms } from "./uniforms.ts";

/**
 * The Filter SDK. A Filter is a definition (what the Catalog lists) plus a
 * GLSL fragment that turns the frame accumulated below it into a new one,
 * and optionally `create`, which makes one instance per Filter Layer per
 * Output. The instance is the JavaScript half of an animated Filter: it
 * integrates its clocks and counters from the frame's `dt`, exactly as a
 * Visual does, and hands the shader the uniforms for this frame. The
 * shader only samples; nothing in it derives from absolute time.
 *
 * Every uniform a fragment reads is `u_<name>`: the Parameters by their
 * name, and whatever the instance returns by its key (see `uniforms.ts`
 * for the shapes); a choice Parameter is an int option index and a color a
 * vec4. The fragment defines
 * `vec4 filter_image(vec2 uv)` over a prelude that provides `u_resolution`
 * and `u_texel`, `sample_input` (clamped at the edges), `sample_mirrored`
 * (reflected, so displaced pixels never show the frame border), `hash` and
 * `hash2`. Mix is applied by the engine after the fragment runs.
 */
export interface FilterContext<S extends ParameterSchema> {
  /** The frame size in pixels; it may change later, see the frame. */
  readonly width: number;
  readonly height: number;
  readonly params: ParameterValuesOf<S>;
  readonly random: Random;
}

export interface FilterFrame<S extends ParameterSchema> {
  /** Seconds since the previous update, clamped to `MAX_FRAME_SECONDS`. */
  readonly dt: number;
  readonly params: ParameterValuesOf<S>;
  readonly width: number;
  readonly height: number;
  /** True when a Parameter differs from the previous frame's, and on the first frame. */
  readonly changed: boolean;
}

/**
 * What an update reports. Not `changed` means the pass would produce the
 * same picture from the same input as last frame, so a still Scene under a
 * still Filter is not recomposited. `identity` means the pass would return
 * its input unchanged (an Amount at zero), so it is skipped altogether.
 * `uniforms` are kept from one frame to the next until returned again.
 * Everything defaults to the safe answer: changed, not identity.
 */
export interface FilterUpdate {
  readonly changed?: boolean;
  readonly identity?: boolean;
  readonly uniforms?: Uniforms;
}

export interface FilterInstance<S extends ParameterSchema> {
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- an update with nothing to report returns nothing
  update(frame: FilterFrame<S>): FilterUpdate | void;
  dispose?(): void;
}

export interface ShaderFilter<
  S extends ParameterSchema = ParameterSchema,
> extends FilterDefinition {
  readonly backend: "shader";
  readonly parameters: S;
  /** GLSL ES 3.00 defining `vec4 filter_image(vec2 uv)`; may declare its own `u_` uniforms. */
  readonly fragment: string;
  /** Absent for a Filter whose picture depends only on its Parameters. */
  create?(context: FilterContext<S>): FilterInstance<S>;
}

/** Declares a Filter; the Parameter schema types `params` everywhere. */
export function defineFilter<const S extends ParameterSchema>(
  filter: Omit<ShaderFilter<S>, "kind" | "backend">,
): ShaderFilter<S> {
  return { ...filter, kind: "filter", backend: "shader" };
}

/** A definition the Catalog lists that can also be run here. */
export function isShaderFilter(
  definition: FilterDefinition,
): definition is ShaderFilter {
  return definition.backend === "shader" && "fragment" in definition;
}
