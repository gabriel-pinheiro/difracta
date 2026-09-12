import type { ParameterSchema, VisualDefinition } from "@difracta/core";

import type { Uniforms } from "./uniforms.ts";
import type { PathRequirements, VisualContext, VisualFrame } from "./visual.ts";

/**
 * A shader Visual is a definition plus a GLSL fragment defining
 * `vec4 render_visual(vec2 uv)` over Surface Space, drawn straight into
 * the frame through the Surface's mapping with the Layer's opacity, blend
 * mode and Masks applied by the engine. Its optional `create` makes an
 * instance exactly like a canvas Visual's, except that `update` returns
 * the uniforms the fragment reads this frame instead of drawing: the
 * instance integrates clocks and live events in JavaScript, the fragment
 * only paints. Uniform naming and the prelude (`u_resolution`, `u_texel`,
 * `hash`, `hash2`) follow the Filter SDK; each declared Path arrives as
 * `u_path_<key>_points`, `_count` and `_closed` (see `sdk/path.ts`).
 */
export interface ShaderUpdate {
  /** False when the picture would be the same as last frame's. */
  readonly changed?: boolean;
  /** True when there is nothing to draw, so the Layer is skipped. */
  readonly blank?: boolean;
  /** Kept from one frame to the next until returned again. */
  readonly uniforms?: Uniforms;
}

export interface ShaderVisualInstance<
  S extends ParameterSchema,
  P extends PathRequirements = PathRequirements,
> {
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- an update with nothing to report returns nothing
  update(frame: VisualFrame<S, P>): ShaderUpdate | void;
  cue?(key: string): void;
  dispose?(): void;
}

export interface ShaderVisual<
  S extends ParameterSchema = ParameterSchema,
  P extends PathRequirements = PathRequirements,
> extends VisualDefinition {
  readonly backend: "shader";
  readonly parameters: S;
  readonly paths?: P;
  /** GLSL ES 3.00 defining `vec4 render_visual(vec2 uv)`; may declare its own `u_` uniforms. */
  readonly fragment: string;
  /** Absent for a Visual whose picture depends only on its Parameters and Paths. */
  create?(context: VisualContext<S, P>): ShaderVisualInstance<S, P>;
}

/** Declares a shader Visual; the Parameter schema types `params` and the Paths type `paths` everywhere. */
export function defineShaderVisual<
  const S extends ParameterSchema,
  const P extends PathRequirements = readonly [],
>(visual: Omit<ShaderVisual<S, P>, "kind" | "backend">): ShaderVisual<S, P> {
  return { ...visual, kind: "visual", backend: "shader" };
}

/** A definition the Catalog lists that can also be run here. */
export function isShaderVisual(
  definition: VisualDefinition,
): definition is ShaderVisual {
  return definition.backend === "shader" && "fragment" in definition;
}
