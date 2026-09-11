import {
  childLayers,
  CORNERS,
  orderedEntries,
  resolveCalibration,
  type CornerName,
  type Document,
  type Layer,
  type Mask,
  type Quad,
  type Surface,
  type VisualLayer,
} from "@difracta/core";

export type SurfaceStyle = "fill" | "pattern" | "outline";

/** One Surface's appearance on the Output this frame. */
export interface SurfaceDraw {
  readonly surface: Surface;
  readonly corners: Quad;
  readonly style: SurfaceStyle;
  /** The Surface being calibrated: brighter, labelled, with its selected corner. */
  readonly highlighted: boolean;
  /** Masks of this Surface, in order, when they cut the draw; empty otherwise. */
  readonly masks: readonly Mask[];
  readonly corner: CornerName | undefined;
  /** The Mask being aligned, drawn as an outline with its points. */
  readonly maskOutline:
    { readonly mask: Mask; readonly point: number | undefined } | undefined;
}

/** One Visual Layer of the active Scene landing on this Output through its Target. */
export interface LayerDraw {
  readonly layer: VisualLayer;
  /** The Visual's definition id; a Layer without one is not planned. */
  readonly visual: string;
  readonly surface: Surface;
  readonly corners: Quad;
  readonly masks: readonly Mask[];
}

export interface FramePlan {
  readonly blackout: boolean;
  /** Calibration drawings, only in Calibration Mode on this Output. */
  readonly draws: readonly SurfaceDraw[];
  /** The Scene's Layers to composite, bottom first; empty while calibrating. */
  readonly layers: readonly LayerDraw[];
}

/**
 * What one Output shows for a document: nothing under Blackout; otherwise
 * the active Scene's Layers on their Surfaces, or, in Calibration Mode on
 * this Output, the calibrated Surface as a pattern and the others as the
 * view says. Pure, so the rules are testable without a GPU.
 */
export function planFrame(document: Document, outputId: string): FramePlan {
  if (document.operational.blackout)
    return { blackout: true, draws: [], layers: [] };
  const masksOf = (surface: Surface): readonly Mask[] =>
    orderedEntries(document.masks).filter(
      (mask) => mask.surfaceId === surface.id,
    );
  const calibration = resolveCalibration(document);
  const calibrating =
    calibration?.outputId === outputId ? calibration : undefined;
  if (calibrating === undefined)
    return {
      blackout: false,
      draws: [],
      layers: planLayers(document, outputId, masksOf),
    };
  const draws: SurfaceDraw[] = [];
  for (const surface of orderedEntries(document.surfaces)) {
    if (surface.output !== outputId) continue;
    const corners = surface.mappings[outputId]?.corners;
    if (corners === undefined) continue;
    if (surface.id === calibrating.surface.id) {
      const mask = calibrating.mask;
      draws.push({
        surface,
        corners,
        style: "pattern",
        highlighted: true,
        // A Mask hides the corners being dragged, so it only applies while
        // the Mask itself is aligned, against the shape the audience sees.
        masks: mask === undefined ? [] : masksOf(surface),
        corner:
          mask === undefined
            ? (calibrating.calibration.corner ?? undefined)
            : undefined,
        maskOutline:
          mask === undefined ? undefined : { mask, point: calibrating.point },
      });
      continue;
    }
    const view = calibrating.calibration.view;
    if (view === "selected") continue;
    draws.push({
      surface,
      corners,
      style: view === "outlines" ? "outline" : "pattern",
      highlighted: false,
      masks: [],
      corner: undefined,
      maskOutline: undefined,
    });
  }
  return { blackout: false, draws, layers: [] };
}

/**
 * The active Scene's Visual Layers that land on this Output: enabled with
 * every Group above them enabled, a Visual picked, and a Target assigned
 * here with a mapping. Filters are passed over here; a Group only gates.
 * Bottom first, so drawing in order stacks them as the navigator shows.
 */
function planLayers(
  document: Document,
  outputId: string,
  masksOf: (surface: Surface) => readonly Mask[],
): readonly LayerDraw[] {
  const sceneId = document.installation.activeScene;
  if (sceneId === null || !(sceneId in document.scenes)) return [];
  const result: LayerDraw[] = [];
  const visit = (parentId: string | null): void => {
    // Top to bottom as ordered; reversed once at the end.
    for (const layer of childLayers(document.layers, sceneId, parentId)) {
      if (!layer.enabled) continue;
      if (layer.kind === "group") visit(layer.id);
      else if (layer.kind === "visual") {
        const draw = layerDraw(document, outputId, layer, masksOf);
        if (draw !== undefined) result.push(draw);
      }
    }
  };
  visit(null);
  return result.reverse();
}

function layerDraw(
  document: Document,
  outputId: string,
  layer: Layer & { kind: "visual" },
  masksOf: (surface: Surface) => readonly Mask[],
): LayerDraw | undefined {
  if (layer.visual === null || layer.target === null) return undefined;
  const surface = document.surfaces[layer.target];
  if (surface?.output !== outputId) return undefined;
  const corners = surface.mappings[outputId]?.corners;
  if (corners === undefined) return undefined;
  return {
    layer,
    visual: layer.visual,
    surface,
    corners,
    masks: masksOf(surface),
  };
}

export const CORNER_INDEX: Readonly<Record<CornerName, number>> =
  Object.fromEntries(CORNERS.map((corner, index) => [corner, index])) as Record<
    CornerName,
    number
  >;
