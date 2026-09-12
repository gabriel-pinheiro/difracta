import {
  childLayers,
  CORNERS,
  orderedEntries,
  resolveCalibration,
  resolveLayerPaths,
  type Catalog,
  type CornerName,
  type Document,
  type FilterLayer,
  type Layer,
  type Mask,
  type Path,
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
  /** The Path being aligned, drawn as a line with its points. */
  readonly pathOutline:
    { readonly path: Path; readonly point: number | undefined } | undefined;
}

/** One Visual Layer of the active Scene landing on this Output through its Target. */
export interface LayerDraw {
  readonly layer: VisualLayer;
  /** The Visual's definition id; a Layer without one is not planned. */
  readonly visual: string;
  readonly surface: Surface;
  readonly corners: Quad;
  readonly masks: readonly Mask[];
  /** The Paths the Visual declares, bound and on this Surface, by key. */
  readonly paths: Readonly<Record<string, Path>>;
}

/** One Filter Layer of the active Scene with something under it on this Output. */
export interface FilterDraw {
  readonly layer: FilterLayer;
  /** The Filter's definition id; a Layer without one is not planned. */
  readonly filter: string;
  /** How many planned Layers are below it: the pass runs once that many are drawn. */
  readonly below: number;
}

export interface FramePlan {
  readonly blackout: boolean;
  /** Calibration drawings, only in Calibration Mode on this Output. */
  readonly draws: readonly SurfaceDraw[];
  /** The Scene's Layers to composite, bottom first; empty while calibrating. */
  readonly layers: readonly LayerDraw[];
  /** The Scene's Filters in the same order, each placed by `below`. */
  readonly filters: readonly FilterDraw[];
}

const NOTHING = { layers: [], filters: [] } as const;

/**
 * What one Output shows for a document: nothing under Blackout; otherwise
 * the active Scene's Layers on their Surfaces, or, in Calibration Mode on
 * this Output, the calibrated Surface as a pattern and the others as the
 * view says. The Catalog says which Paths each Visual needs bound. Pure,
 * so the rules are testable without a GPU.
 */
export function planFrame(
  document: Document,
  outputId: string,
  catalog: Catalog,
): FramePlan {
  if (document.operational.blackout)
    return { blackout: true, draws: [], ...NOTHING };
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
      ...planStack(document, outputId, catalog, masksOf),
    };
  const draws: SurfaceDraw[] = [];
  for (const surface of orderedEntries(document.surfaces)) {
    if (surface.output !== outputId) continue;
    const corners = surface.mappings[outputId]?.corners;
    if (corners === undefined) continue;
    if (surface.id === calibrating.surface.id) {
      const { mask, path } = calibrating;
      const shape = mask ?? path;
      draws.push({
        surface,
        corners,
        style: "pattern",
        highlighted: true,
        // A Mask hides the corners being dragged, so Masks only apply while
        // a Mask or Path is aligned, against the shape the audience sees.
        masks: shape === undefined ? [] : masksOf(surface),
        corner:
          shape === undefined
            ? (calibrating.calibration.corner ?? undefined)
            : undefined,
        maskOutline:
          mask === undefined ? undefined : { mask, point: calibrating.point },
        pathOutline:
          path === undefined ? undefined : { path, point: calibrating.point },
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
      pathOutline: undefined,
    });
  }
  return { blackout: false, draws, ...NOTHING };
}

/**
 * The active Scene's stack as it lands on this Output: Visual Layers that
 * are enabled with every Group above them enabled, have a Visual with every
 * Path it declares bound, and target a Surface here with a mapping; and
 * Filter Layers enabled the same
 * way, with a Filter and a mix above zero, that have at least one such
 * Layer below them, since a Filter transforms what is already drawn and a
 * Group only gates. Bottom first, so drawing in order stacks them as the
 * navigator shows.
 */
function planStack(
  document: Document,
  outputId: string,
  catalog: Catalog,
  masksOf: (surface: Surface) => readonly Mask[],
): Pick<FramePlan, "layers" | "filters"> {
  const sceneId = document.installation.activeScene;
  if (sceneId === null || !(sceneId in document.scenes)) return NOTHING;
  type Item =
    | { readonly kind: "layer"; readonly draw: LayerDraw }
    | {
        readonly kind: "filter";
        readonly layer: FilterLayer;
        readonly filter: string;
      };
  const items: Item[] = [];
  const visit = (parentId: string | null): void => {
    // Top to bottom as ordered; reversed once at the end.
    for (const layer of childLayers(document.layers, sceneId, parentId)) {
      if (!layer.enabled) continue;
      if (layer.kind === "group") visit(layer.id);
      else if (layer.kind === "visual") {
        const draw = layerDraw(document, outputId, catalog, layer, masksOf);
        if (draw !== undefined) items.push({ kind: "layer", draw });
      } else if (layer.filter !== null && layer.mix > 0)
        items.push({ kind: "filter", layer, filter: layer.filter });
    }
  };
  visit(null);
  items.reverse();
  const layers: LayerDraw[] = [];
  const filters: FilterDraw[] = [];
  for (const item of items) {
    if (item.kind === "layer") layers.push(item.draw);
    else if (layers.length > 0)
      filters.push({
        layer: item.layer,
        filter: item.filter,
        below: layers.length,
      });
  }
  return { layers, filters };
}

function layerDraw(
  document: Document,
  outputId: string,
  catalog: Catalog,
  layer: Layer & { kind: "visual" },
  masksOf: (surface: Surface) => readonly Mask[],
): LayerDraw | undefined {
  if (layer.visual === null || layer.target === null) return undefined;
  const surface = document.surfaces[layer.target];
  if (surface?.output !== outputId) return undefined;
  const corners = surface.mappings[outputId]?.corners;
  if (corners === undefined) return undefined;
  const paths = resolveLayerPaths(document, catalog, layer);
  if (paths === undefined) return undefined;
  return {
    layer,
    visual: layer.visual,
    surface,
    corners,
    masks: masksOf(surface),
    paths,
  };
}

export const CORNER_INDEX: Readonly<Record<CornerName, number>> =
  Object.fromEntries(CORNERS.map((corner, index) => [corner, index])) as Record<
    CornerName,
    number
  >;
