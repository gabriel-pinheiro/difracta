import { defaultParameterValues } from "@difracta/core";

import { flashMatrix } from "../../difracta-visuals/src/visuals/flash-matrix.ts";
import { ShaderVisualPrograms } from "../src/shader-visuals.ts";

/** One pixel at each cell centre, using the production shader and uniform path. */
function sampleFlashMatrix(
  coverage: number,
  seeds: readonly number[],
): number[][] {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 10;
  const gl = canvas.getContext("webgl2", { antialias: false });
  if (gl === null) throw new Error("WebGL2 is unavailable.");
  const quad = gl.createBuffer();
  if (quad === null) throw new Error("Buffer allocation failed.");
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  const programs = new ShaderVisualPrograms(gl, quad);
  const params = {
    ...defaultParameterValues(flashMatrix.parameters),
    columns: 10,
    rows: 10,
    coverage,
    delaySpread: 0,
    hold: 1000,
    fadeOut: 0,
    gap: 0,
    colorA: [1, 1, 1, 1] as const,
    colorB: [1, 1, 1, 1] as const,
  };
  const packed = new Float32Array(24 * 2);
  packed[0] = 0.1;
  const pixels = new Uint8Array(10 * 10 * 4);
  try {
    return seeds.map((seed) => {
      packed[1] = seed;
      programs.draw({
        visual: flashMatrix,
        params,
        uniforms: { flashes: { size: 2, values: packed }, flash_count: 1 },
        paths: {},
        width: 10,
        height: 10,
        opacity: 1,
        homography: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
        maskTexture: undefined,
      });
      const failure = programs.failure(flashMatrix.id);
      if (failure !== undefined) throw new Error(failure);
      gl.readPixels(0, 0, 10, 10, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      if (gl.getError() !== gl.NO_ERROR) throw new Error("WebGL read failed.");
      return Array.from({ length: 100 }, (_, cell) =>
        (pixels[cell * 4 + 3] ?? 0) > 0 ? 1 : 0,
      );
    });
  } finally {
    programs.dispose();
    gl.deleteBuffer(quad);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

declare global {
  interface Window {
    sampleFlashMatrix: typeof sampleFlashMatrix;
  }
}

window.sampleFlashMatrix = sampleFlashMatrix;
