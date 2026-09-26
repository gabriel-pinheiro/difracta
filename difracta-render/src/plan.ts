import {
  childLayers,
  CORNERS,
  orderedEntries,
  REGION_CORNERS,
  resolveCalibration,
  resolveLayerPaths,
  resolveTarget,
  type Catalog,
  type CornerName,
  type Document,
  type FilterLayer,
  type Layer,
  type Mask,
  type Path,
  type Quad,
  type Rect,
  type Region,
  type RegionCorner,
  type Surface,
  type SurfaceSize,
  type VisualLayer,
} from "@difracta/core";

import { regionCorners, regionPaths } from "./region-targets.ts";

export type SurfaceStyle = "fill" | "pattern" | "outline";

/** One Region of the calibrated Surface, drawn as an outline over the pattern. */
export interface RegionOutline {
  readonly region: Region;
  /** The Region being aligned: brighter, with its two corners marked. */
  readonly highlighted: boolean;
  /** Its corner highlighted on the Output, when it is the one being aligned. */
  readonly corner: RegionCorner | undefined;
}

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
  /** The Surface's Regions, while the Surface or one of them is being aligned. */
  readonly regions: readonly RegionOutline[];
}

/**
 * One Visual Layer of the active Scene landing on this Output through its
 * Target: a Surface, or a Region of one, which inherits the Surface's
 * mapping and Masks and presents its rectangle as the unit square.
 */
export interface LayerDraw {
  readonly layer: VisualLayer;
  /** The Visual's definition id; a Layer without one is not planned. */
  readonly visual: string;
  /** The Target's id: the Surface's, or the Region's. */
  readonly target: string;
  readonly surface: Surface;
  /**
   * Where the Target's unit square lands in the Projection Frame: the
   * Surface's mapping, or the Region's rectangle pushed through it, so its
   * own homography is the composed map.
   */
  readonly corners: Quad;
  /** The Surface's mapping, which the Mask texture is rasterized for. */
  readonly surfaceCorners: Quad;
  /** The Target inside Surface Space, for sampling the Masks; the whole square for a Surface. */
  readonly rect: Rect;
  /** The Target's physical size when the Surface states one: the Surface's, scaled by the rectangle. */
  readonly size: SurfaceSize | null;
  readonly masks: readonly Mask[];
  /** The Paths the Visual declares, bound and on this Surface, by key, in the Target's space. */
  readonly paths: Readonly<Record<string, Path>>;
  /**
   * Opacity at zero: the Layer keeps its place and its instance, which
   * idles, but it is not stepped, not drawn and gives no Filter its input.
   */
  readonly hidden: boolean;
}

/** One Filter Layer of the active Scene with something under it on this Output. */
export interface FilterDraw {
  readonly layer: FilterLayer;
  /** The Filter's definition id; a Layer without one is not planned. */
  readonly filter: string;
  /**
   * How many planned Layers, hidden ones included, are below it: the pass
   * runs once that many are drawn.
   */
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
      const { mask, path, region } = calibrating;
      const shape = mask ?? path ?? region;
      const corner = calibrating.calibration.corner ?? undefined;
      draws.push({
        surface,
        corners,
        style: "pattern",
        highlighted: true,
        // A Mask hides the corners being dragged, so Masks only apply while
        // a Mask, Path or Region is aligned, against the shape the audience sees.
        masks: shape === undefined ? [] : masksOf(surface),
        corner: shape === undefined ? corner : undefined,
        maskOutline:
          mask === undefined ? undefined : { mask, point: calibrating.point },
        pathOutline:
          path === undefined ? undefined : { path, point: calibrating.point },
        // Regions follow the quad, so they show while it or one of them is aligned.
        regions:
          mask !== undefined || path !== undefined
            ? []
            : regionsOf(document, surface).map((entry) => ({
                region: entry,
                highlighted: entry.id === region?.id,
                corner:
                  entry.id === region?.id && isRegionCorner(corner)
                    ? corner
                    : undefined,
              })),
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
      regions: [],
    });
  }
  return { blackout: false, draws, ...NOTHING };
}

function regionsOf(document: Document, surface: Surface): readonly Region[] {
  return orderedEntries(document.regions).filter(
    (region) => region.surfaceId === surface.id,
  );
}

function isRegionCorner(
  corner: CornerName | undefined,
): corner is RegionCorner {
  return (
    corner !== undefined &&
    (REGION_CORNERS as readonly string[]).includes(corner)
  );
}

/**
 * The active Scene's stack as it lands on this Output: Visual Layers that
 * are enabled with every Group above them enabled, have a Visual with every
 * Path it declares bound, and target a Surface here with a mapping, the
 * ones at opacity zero marked hidden; and Filter Layers enabled the same
 * way, with a Filter and a mix above zero, that have at least one such
 * Layer, not hidden, below them, since a Filter transforms what is already
 * drawn and a Group only gates. Bottom first, so drawing in order stacks
 * them as the navigator shows.
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
  let visible = 0;
  for (const item of items) {
    if (item.kind === "layer") {
      layers.push(item.draw);
      if (!item.draw.hidden) visible += 1;
    } else if (visible > 0)
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
  const resolved = resolveTarget(document, layer.target);
  if (resolved === undefined) return undefined;
  const { surface, region, rect } = resolved;
  if (surface.output !== outputId) return undefined;
  const surfaceCorners = surface.mappings[outputId]?.corners;
  if (surfaceCorners === undefined) return undefined;
  const paths = resolveLayerPaths(document, catalog, layer);
  if (paths === undefined) return undefined;
  const corners =
    region === undefined
      ? surfaceCorners
      : regionCorners(region, surfaceCorners);
  if (corners === undefined) return undefined;
  return {
    layer,
    visual: layer.visual,
    target: layer.target,
    surface,
    corners,
    surfaceCorners,
    rect,
    size:
      surface.size === null || region === undefined
        ? surface.size
        : {
            width: surface.size.width * rect.width,
            height: surface.size.height * rect.height,
          },
    masks: masksOf(surface),
    paths: region === undefined ? paths : regionPaths(region, paths),
    hidden: layer.opacity <= 0,
  };
}

/**
 * The Surfaces the frame keeps GPU resources for: every one with a planned
 * Layer, hidden or blank ones included, or a calibration drawing, so a
 * Layer that draws nothing this frame does not cost its Surface's Masks a
 * rebuild when it draws again.
 */
export function plannedSurfaces(
  plan: Pick<FramePlan, "layers" | "draws">,
): ReadonlySet<string> {
  return new Set([
    ...plan.layers.map((draw) => draw.surface.id),
    ...plan.draws.map((draw) => draw.surface.id),
  ]);
}

export const CORNER_INDEX: Readonly<Record<CornerName, number>> =
  Object.fromEntries(CORNERS.map((corner, index) => [corner, index])) as Record<
    CornerName,
    number
  >;
