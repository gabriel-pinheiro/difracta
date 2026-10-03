import type { Catalog } from "@difracta/core";

import type { LayerFrame } from "./layer-players.ts";
import type { LayerDraw } from "./plan.ts";
import type { ShaderVisualPrograms } from "./shader-visuals.ts";
import {
  MODE,
  type Rect,
  type SurfaceProgram,
  WHOLE,
} from "./surface-program.ts";

/** What compositing one Layer onto its Surface needs of the compositor's resources. */
export interface DrawResources {
  readonly gl: WebGL2RenderingContext;
  readonly program: SurfaceProgram;
  readonly shaderPrograms: ShaderVisualPrograms;
}

/** A shader Layer run over its Surface, with opacity, blend mode and the Surface's Masks. */
export function drawShader(
  resources: DrawResources,
  frame: LayerFrame & { kind: "shader" },
  homography: Float32Array,
  maskTexture: WebGLTexture | undefined,
): void {
  const { gl } = resources;
  const { layer } = frame.draw;
  if (layer.blendMode === "additive") gl.blendFunc(gl.ONE, gl.ONE);
  resources.shaderPrograms.draw({
    visual: frame.visual,
    params: frame.params,
    uniforms: frame.uniforms,
    textures: frame.textures,
    paths: frame.draw.paths,
    width: frame.width,
    height: frame.height,
    opacity: layer.opacity,
    homography,
    maskTexture,
    maskRect: maskRectOf(frame.draw),
  });
  if (layer.blendMode === "additive")
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  resources.program.use();
}

/** A Layer's canvas or shader buffer over its Surface, with opacity, blend mode and the Surface's Masks. */
export function drawTexture(
  resources: DrawResources,
  draw: LayerDraw,
  texture: WebGLTexture,
  maskTexture: WebGLTexture | undefined,
  /** The texture's rows are bottom first, as a Layer chain's result is. */
  flipped = false,
): void {
  const { gl, program } = resources;
  const { uniforms } = program;
  const { layer } = draw;
  program.setMask(maskTexture, maskRectOf(draw));
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.uniform1i(uniforms.mode, MODE.layer);
  gl.uniform4f(uniforms.color, 1, 1, 1, layer.opacity);
  gl.uniform4f(uniforms.rect, ...WHOLE);
  if (layer.blendMode === "additive") gl.blendFunc(gl.ONE, gl.ONE);
  if (flipped) gl.uniform1i(uniforms.flip, 1);
  program.drawSurface();
  if (flipped) gl.uniform1i(uniforms.flip, 0);
  if (layer.blendMode === "additive")
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
}

/** The Media items the planned Layers name in a Parameter that takes one. */
export function plannedMedia(
  layers: readonly LayerDraw[],
  catalog: Catalog,
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const { layer, visual } of layers) {
    const parameters = catalog.visual(visual)?.parameters ?? {};
    for (const [name, parameter] of Object.entries(parameters)) {
      const value = layer.parameters[name];
      if (parameter.kind === "media" && typeof value === "string" && value)
        ids.add(value);
    }
  }
  return ids;
}

/** The Target's rectangle as the shaders take it: x, y, width, height. */
function maskRectOf(draw: LayerDraw): Rect {
  const { rect } = draw;
  return [rect.x, rect.y, rect.width, rect.height];
}
