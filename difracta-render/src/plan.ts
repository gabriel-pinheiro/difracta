import {
  childLayers,
  CORNERS,
  enabledCorners,
  orderedEntries,
  resolveCalibration,
  resolveLayerPaths,
  resolveTarget,
  type Catalog,
  type CornerName,
  type Document,
  type FilterLayer,
  type Layer,
  type Mask,
  type OutputMask,
  type Path,
  type Quad,
  type Rect,
  type Region,
  type RegionCorner,
  type Surface,
  type SurfaceSize,
  type VisualLayer,
} from "@difracta/core";

import { calibrationDraws } from "./plan-calibration.ts";
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
 * One Filter Layer inside a Visual Layer: a pass over that Layer's picture
 * alone, in its Target's space, before the picture is drawn onto the
 * Surface.
 */
export interface NestedFilterDraw {
  readonly layer: FilterLayer;
  /** The Filter's definition id; a Layer without one is not planned. */
  readonly filter: string;
}

/**
 * One Visual Layer of the active Scene landing on this Output through its
 * Target: a Surface, or a Region of one, which inherits the Surface's
 * mapping and Masks and presents its rectangle as the unit square. Its
 * Filter Layers come with it, and run over its picture before it is
 * composited; its opacity, blend mode and Masks apply after them.
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
   * Opacity at zero: the Layer keeps its place and its instances, the
   * Visual's and its Filters', which idle, but it is not stepped, not
   * drawn and gives no root Filter its input.
   */
  readonly hidden: boolean;
  /**
   * The Layer's Filter Layers that run over its picture: enabled, with a
   * Filter and a mix above zero, bottom first, the order they run in.
   * Empty for a Layer on the plain path.
   */
  readonly filters: readonly NestedFilterDraw[];
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

/** The Output Mask being aligned, drawn as an outline in frame space with its points. */
export interface OutputMaskOutline {
  readonly mask: OutputMask;
  readonly point: number | undefined;
}

export interface FramePlan {
  readonly blackout: boolean;
  /** Calibration drawings, only in Calibration Mode on this Output. */
  readonly draws: readonly SurfaceDraw[];
  /** The Output Mask being aligned in Calibration Mode on this Output, over the draws. */
  readonly outputMaskOutline: OutputMaskOutline | undefined;
  /** The Scene's Layers to composite, bottom first; empty while calibrating. */
  readonly layers: readonly LayerDraw[];
  /** The Scene's Filters in the same order, each placed by `below`. */
  readonly filters: readonly FilterDraw[];
  /**
   * The Output's masks in order, cutting the whole frame to black after
   * the Layers and root Filters, in Calibration Mode too; empty when the
   * Output has none, and under Blackout.
   */
  readonly outputMasks: readonly OutputMask[];
}

const NOTHING = { layers: [], filters: [] } as const;
const NO_CALIBRATION = { draws: [], outputMaskOutline: undefined } as const;

/**
 * What one Output shows for a document: nothing under Blackout; otherwise
 * the active Scene's Layers on their Surfaces, or, in Calibration Mode on
 * this Output, the calibrated Surface as a pattern and the others as the
 * view says, or every Surface as a pattern when the Output itself or one of
 * its Output Masks is calibrated (`plan-calibration.ts`); the Output's
 * masks come along either way. The Catalog says which Paths each Visual
 * needs bound. Pure, so the rules are testable without a GPU.
 */
export function planFrame(
  document: Document,
  outputId: string,
  catalog: Catalog,
): FramePlan {
  if (document.operational.blackout)
    return { blackout: true, ...NO_CALIBRATION, ...NOTHING, outputMasks: [] };
  const masksOf = (surface: Surface): readonly Mask[] =>
    orderedEntries(document.masks).filter(
      (mask) => mask.surfaceId === surface.id,
    );
  const outputMasks = orderedEntries(document.outputMasks).filter(
    (mask) => mask.outputId === outputId,
  );
  const calibration = resolveCalibration(document);
  const calibrating =
    calibration?.outputId === outputId ? calibration : undefined;
  if (calibrating === undefined)
    return {
      blackout: false,
      ...NO_CALIBRATION,
      ...planStack(document, outputId, catalog, masksOf),
      outputMasks,
    };
  return {
    blackout: false,
    ...calibrationDraws(document, outputId, calibrating, masksOf),
    ...NOTHING,
    outputMasks,
  };
}

/**
 * The active Scene's stack as it lands on this Output: Visual Layers that
 * are enabled with every Group above them enabled, have a Visual with every
 * Path it declares bound, and target a Surface here with a mapping, the
 * ones at opacity zero marked hidden, each carrying its own Filter Layers
 * (enabled, with a Filter and a mix above zero, bottom first); and root
 * Filter Layers enabled the same way, with a Filter and a mix above zero,
 * that have at least one such Layer, not hidden, below them, since a root
 * Filter transforms what is already drawn and a Group only gates. A Visual
 * Layer's own Filters never join the root list: they transform its picture
 * in its Target, not the frame. Bottom first, so drawing in order stacks
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
        if (draw !== undefined)
          items.push({
            kind: "layer",
            draw: { ...draw, filters: nestedFilters(document, layer) },
          });
      } else if (runs(layer))
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

/** A Filter Layer that would run: enabled, with a Filter, with a mix above zero. */
function runs(
  layer: FilterLayer,
): layer is FilterLayer & { readonly filter: string } {
  return layer.enabled && layer.filter !== null && layer.mix > 0;
}

/** The Visual Layer's Filter Layers that run, bottom first. */
function nestedFilters(
  document: Document,
  layer: VisualLayer,
): readonly NestedFilterDraw[] {
  const draws: NestedFilterDraw[] = [];
  for (const child of childLayers(document.layers, layer.sceneId, layer.id))
    if (child.kind === "filter" && runs(child))
      draws.push({ layer: child, filter: child.filter });
  return draws.reverse();
}

function layerDraw(
  document: Document,
  outputId: string,
  catalog: Catalog,
  layer: Layer & { kind: "visual" },
  masksOf: (surface: Surface) => readonly Mask[],
): Omit<LayerDraw, "filters"> | undefined {
  if (layer.visual === null || layer.target === null) return undefined;
  const resolved = resolveTarget(document, layer.target);
  if (resolved === undefined) return undefined;
  const { surface, region, rect } = resolved;
  const surfaceCorners = enabledCorners(surface, outputId);
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
