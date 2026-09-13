import {
  createBuiltInRegistry,
  emptyDocument,
  executeCommand,
  type BlendMode,
  type Document,
  type Point,
  type Quad,
} from "@difracta/core";

import { testCatalog } from "./test-catalog.ts";

/**
 * Documents for the GPU suite, built through the commands like Studio
 * would: one Output, Surfaces mapped to quads of the frame, one Scene
 * whose Layers are added bottom first, Masks on their Surfaces. Colours
 * are RGBA in 0..1, like a color Parameter.
 */
export const OUTPUT = "out";
const SCENE = "scene";

export type Color = readonly [number, number, number, number];

const registry = createBuiltInRegistry(testCatalog);

export function run(
  document: Document,
  name: string,
  payload: unknown,
): Document {
  const result = executeCommand(registry, document, name, payload);
  if (!result.ok) throw new Error(`${name}: ${result.error}`);
  return result.document;
}

/** The unit square rotated by `degrees` about `centre`, `half` wide on each side, in frame fractions. */
export function rotatedQuad(
  centre: Point,
  half: number,
  degrees: number,
): Quad {
  const angle = (degrees * Math.PI) / 180;
  const at = (u: number, v: number): Point => ({
    x: centre.x + u * half * Math.cos(angle) - v * half * Math.sin(angle),
    y: centre.y + u * half * Math.sin(angle) + v * half * Math.cos(angle),
  });
  return {
    topLeft: at(-1, -1),
    topRight: at(1, -1),
    bottomRight: at(1, 1),
    bottomLeft: at(-1, 1),
  };
}

/** An axis-aligned rectangle of the frame as a Quad. */
export function rect(x0: number, y0: number, x1: number, y1: number): Quad {
  return {
    topLeft: { x: x0, y: y0 },
    topRight: { x: x1, y: y0 },
    bottomRight: { x: x1, y: y1 },
    bottomLeft: { x: x0, y: y1 },
  };
}

export interface LayerOptions {
  readonly opacity?: number;
  readonly blendMode?: BlendMode;
  readonly params?: Readonly<Record<string, unknown>>;
}

export class Stage {
  #document: Document;

  constructor() {
    let document = emptyDocument("GPU suite");
    document = run(document, "output.create", { id: OUTPUT, name: "Out" });
    this.#document = run(document, "scene.create", {
      id: SCENE,
      name: "Scene",
    });
  }

  /** A Surface on the Output, over the whole frame or the quad given. */
  surface(id: string, corners?: Quad): this {
    this.#document = run(this.#document, "surface.create", {
      id,
      name: id,
      output: OUTPUT,
    });
    if (corners !== undefined)
      for (const [corner, point] of Object.entries(corners))
        this.#document = run(this.#document, "surface.corner.set", {
          surfaceId: id,
          corner,
          point,
        });
    return this;
  }

  /** A Visual Layer on top of the ones so far. */
  visual(
    id: string,
    surfaceId: string,
    visual: string,
    { opacity, blendMode, params = {} }: LayerOptions = {},
  ): this {
    this.#document = run(this.#document, "layer.create", {
      id,
      kind: "visual",
      sceneId: SCENE,
    });
    this.#document = run(this.#document, "layer.visual", {
      layerId: id,
      visual,
    });
    this.#document = run(this.#document, "layer.update", {
      layerId: id,
      target: surfaceId,
      ...(opacity === undefined ? {} : { opacity }),
      ...(blendMode === undefined ? {} : { blendMode }),
    });
    for (const [name, value] of Object.entries(params))
      this.#document = run(this.#document, "address.set", {
        address: `layer/${id}/param/${name}`,
        value,
      });
    return this;
  }

  /** A Solid Color Layer. */
  solid(
    id: string,
    surfaceId: string,
    color: Color,
    options: LayerOptions = {},
  ): this {
    return this.visual(id, surfaceId, "solid-color", {
      ...options,
      params: { color },
    });
  }

  /** A Filter Layer on top of the ones so far. */
  filter(id: string, filter: string, mix = 1): this {
    this.#document = run(this.#document, "layer.create", {
      id,
      kind: "filter",
      sceneId: SCENE,
    });
    this.#document = run(this.#document, "layer.filter", {
      layerId: id,
      filter,
    });
    this.#document = run(this.#document, "layer.update", {
      layerId: id,
      mix,
    });
    return this;
  }

  /** A four-point Mask on a Surface, its points in Surface Space. */
  mask(
    id: string,
    surfaceId: string,
    points: Quad,
    { mode = "include", feather = 0 } = {},
  ): this {
    this.#document = run(this.#document, "mask.create", {
      id,
      surfaceId,
      name: id,
    });
    const ordered = [
      points.topLeft,
      points.topRight,
      points.bottomRight,
      points.bottomLeft,
    ];
    ordered.forEach((point, index) => {
      this.#document = run(this.#document, "mask.point.set", {
        maskId: id,
        index,
        point,
      });
    });
    this.#document = run(this.#document, "mask.update", {
      maskId: id,
      mode,
      feather,
    });
    return this;
  }

  blackout(): this {
    this.#document = run(this.#document, "address.set", {
      address: "installation/blackout",
      value: true,
    });
    return this;
  }

  /** Calibration Mode on the Surface with no corner marked, the others hidden. */
  calibrate(surfaceId: string): this {
    this.#document = run(this.#document, "calibration.set", {
      surfaceId,
      maskId: null,
      pathId: null,
      corner: null,
      point: null,
      view: "selected",
      owner: "gpu",
    });
    return this;
  }

  /** The document with the Scene playing. */
  document(): Document {
    return run(this.#document, "scene.play", { sceneId: SCENE });
  }
}
