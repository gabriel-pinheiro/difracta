import {
  autoProxyHeight,
  BASE_PROXY_HEIGHT,
  enabledCorners,
  mediaReferencesInUse,
  parseMediaReference,
  parseResolution,
  playableRendition,
  resolveTarget,
  surfaceCanvasSize,
  wantedRendition,
  type Catalog,
  type Document,
  type MediaUse,
  type Rendition,
} from "@difracta/core";

import { entryOf, type PacksView } from "./pack-sources.ts";
import { regionCorners, targetPhysicalSize } from "./region-targets.ts";

/**
 * Which file each video plays from on one page. Every Layer naming a video
 * entry asks for a Resolution (`MediaUse.resolution`): Original, a proxy
 * size, or Auto, the size its Target takes on this Output. One entry plays
 * from one file per page, so the largest any of its Layers asks is the one
 * (`wantedRendition`, which also keeps an original over its bitrate budget
 * from being played as it is), and while that file is not baked the page
 * plays what is (`playableRendition`): a smaller one while the bake is on
 * its way, never a smaller one for a Pack nothing is baked for. A Macro's
 * action that would put an
 * entry on a Layer asks as that Layer does, so firing it finds the file
 * loaded.
 */
export interface VideoFrame {
  readonly outputId: string;
  /** The canvas in pixels. */
  readonly width: number;
  readonly height: number;
  /** The GPU's texture limit, which caps a Target's size. */
  readonly maxDimension?: number | undefined;
  /** The tallest file this page plays, a proxy size, whatever a Layer asks: Studio's Preview sets it. */
  readonly maxVideoHeight?: number | undefined;
}

export interface VideoRendition {
  /** The file the entry should play from here. */
  readonly wanted: Rendition;
  /** The file to play now: `wanted`, or what stands in while it bakes. */
  readonly playing: Rendition;
}

/** The larger of two requests; Original is the largest. */
function larger(a: Rendition, b: Rendition): Rendition {
  if (a === "original" || b === "original") return "original";
  return Math.max(a, b);
}

/**
 * The rows of a video of `aspect` (width over height) a Layer's Target
 * shows on this Output, as if it covered the Target, which no Fit asks
 * more than. Undefined when the Layer is not drawn here.
 */
export function targetVideoRows(
  document: Pick<Document, "layers" | "surfaces" | "regions">,
  layerId: string,
  aspect: number,
  frame: VideoFrame,
): number | undefined {
  const layer = document.layers[layerId];
  if (layer?.kind !== "visual") return undefined;
  const target = resolveTarget(document, layer.target);
  if (target === undefined) return undefined;
  const mapping = enabledCorners(target.surface, frame.outputId);
  if (mapping === undefined) return undefined;
  const corners =
    target.region === undefined
      ? mapping
      : regionCorners(target.region, mapping);
  if (corners === undefined) return undefined;
  const size = surfaceCanvasSize({
    corners,
    outputWidth: frame.width,
    outputHeight: frame.height,
    size: targetPhysicalSize(target),
    renderScale: 1,
    maxDimension: frame.maxDimension ?? Infinity,
  });
  return Math.max(size.height, size.width / aspect);
}

/** What one use asks for: its Layer's Resolution, Auto worked out from the Target. */
function requested(
  document: Document,
  use: MediaUse,
  aspect: number,
  frame: VideoFrame,
): Rendition {
  // A Parameter with no Resolution plays the file as it is.
  if (use.resolution === undefined) return "original";
  const asked = parseResolution(use.resolution);
  if (asked !== "auto") return asked;
  const rows = targetVideoRows(document, use.layerId, aspect, frame);
  // A Layer not drawn on this Output needs no more than the smallest.
  return rows === undefined ? BASE_PROXY_HEIGHT : autoProxyHeight(rows);
}

/** Whether the runtime bakes proxies for the Pack of `reference`: not for a read-only one, nor without ffmpeg. */
export function bakes(packs: PacksView, reference: string): boolean {
  const pack = packs[parseMediaReference(reference)?.packId ?? ""];
  return pack !== undefined && pack.readOnly !== true && pack.ffmpeg !== false;
}

/** The file of every video entry the document names that `packs` has, by Media reference. */
export function videoRenditions(
  document: Document,
  catalog: Catalog,
  packs: PacksView,
  frame: VideoFrame,
): ReadonlyMap<string, VideoRendition> {
  const asked = new Map<string, Rendition>();
  for (const use of mediaReferencesInUse(document, catalog)) {
    if (use.accepts !== "video") continue;
    const entry = entryOf(packs, use.reference);
    if (entry?.type !== "video") continue;
    const aspect =
      entry.width !== undefined && entry.height !== undefined
        ? entry.width / entry.height
        : 16 / 9;
    const request = requested(document, use, aspect, frame);
    const before = asked.get(use.reference);
    asked.set(
      use.reference,
      before === undefined ? request : larger(before, request),
    );
  }
  const renditions = new Map<string, VideoRendition>();
  for (const [reference, request] of asked) {
    const entry = entryOf(packs, reference);
    if (entry === undefined) continue;
    const cap = frame.maxVideoHeight;
    const capped =
      cap === undefined
        ? request
        : request === "original"
          ? cap
          : Math.min(request, cap);
    const wanted = wantedRendition(entry, capped);
    renditions.set(reference, {
      wanted,
      playing: playableRendition(
        wanted,
        entry.proxies ?? [],
        bakes(packs, reference),
      ),
    });
  }
  return renditions;
}
