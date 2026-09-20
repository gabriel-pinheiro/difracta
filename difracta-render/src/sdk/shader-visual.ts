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
  /**
   * The share of the Surface's pixels, along each side, the fragment renders
   * at. At 1, the default, it draws straight into the frame; below 1, down
   * to 0.1, it fills a smaller buffer that is stretched over the Surface and
   * redrawn only on frames reporting `changed`, so a costly fragment trades
   * sharpness for speed, and `u_resolution` is that buffer's size. Kept
   * from one frame to the next until returned again.
   */
  readonly resolution?: number;
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

/**
 * Uniform names the engine declares around every shader Visual's fragment,
 * without their `u_`; a Parameter keyed like one would redeclare it, which
 * only a compile in a browser would catch.
 */
const ENGINE_UNIFORMS: readonly string[] = [
  "homography",
  "rect",
  "mask",
  "mask_enabled",
  "opacity",
  "resolution",
  "texel",
];

/** Declares a shader Visual; the Parameter schema types `params` and the Paths type `paths` everywhere. */
export function defineShaderVisual<
  const S extends ParameterSchema,
  const P extends PathRequirements = readonly [],
>(visual: Omit<ShaderVisual<S, P>, "kind" | "backend">): ShaderVisual<S, P> {
  for (const name of Object.keys(visual.parameters))
    if (ENGINE_UNIFORMS.includes(name) || name.startsWith("path_"))
      throw new Error(
        `Shader Visual “${visual.id}”: Parameter “${name}” is named like the engine's uniform u_${name}.`,
      );
  return { ...visual, kind: "visual", backend: "shader" };
}

/** A definition the Catalog lists that can also be run here. */
export function isShaderVisual(
  definition: VisualDefinition,
): definition is ShaderVisual {
  return definition.backend === "shader" && "fragment" in definition;
}
