import type {
  Document,
  MappingFollow,
  Slice,
  SurfaceMapping,
} from "../document/document.ts";
import { CORNERS, type Point, type Quad } from "../document/geometry.ts";
import { resolvedCorners } from "../document/mappings.ts";
import type { Patch } from "../document/patch.ts";
import {
  fromFrame,
  outputSlices,
  insideDisplay,
  projectionFrame,
  toFrame,
  type PixelRect,
} from "../document/slices.ts";

/**
 * What every Slice command shares. Free corners and Output Mask points are
 * normalized to the Projection Frame, whose bounds the Slices decide, so a
 * Slice edit that moves those bounds rewrites them in the same undo step to
 * keep each at its Projection pixel. Following mappings move with what they
 * follow and need nothing, unless the edit unlinks them.
 */
export interface SliceEdit {
  readonly outputId: string;
  /** Slices written whole: new ones and changed ones. */
  readonly set?: readonly Slice[];
  readonly remove?: readonly string[];
  /** Which following mappings the edit unlinks, leaving them where they were. */
  readonly unlinks?: (follow: MappingFollow) => boolean;
}

/** The patches of a Slice edit, re-anchoring and unlinking included. */
export function sliceEditPatches(
  document: Document,
  edit: SliceEdit,
): readonly Patch[] {
  const output = document.outputs[edit.outputId];
  if (output === undefined) return [];
  const set = edit.set ?? [];
  const removed = new Set(edit.remove ?? []);
  const replaced = new Set(set.map((slice) => slice.id));
  const before = outputSlices(document.slices, output.id);
  const after = [
    ...before.filter(
      (slice) => !removed.has(slice.id) && !replaced.has(slice.id),
    ),
    ...set,
  ];
  const from = projectionFrame(output, before);
  const to = projectionFrame(output, after);
  const patches: Patch[] = [
    ...[...removed].map((id): Patch => ({
      op: "remove",
      path: ["slices", id],
    })),
    ...set.map((slice): Patch => ({
      op: "set",
      path: ["slices", slice.id],
      value: slice,
    })),
  ];
  for (const surface of Object.values(document.surfaces)) {
    const mapping = surface.mappings[output.id];
    if (mapping === undefined) continue;
    const next = movedMapping(document, output.id, mapping, from, to, edit);
    if (next !== undefined)
      patches.push({
        op: "set",
        path: ["surfaces", surface.id, "mappings", output.id],
        value: next,
      });
  }
  if (from !== undefined && to !== undefined && !sameRect(from, to))
    for (const mask of Object.values(document.outputMasks)) {
      if (mask.outputId !== output.id) continue;
      patches.push({
        op: "set",
        path: ["outputMasks", mask.id, "points"],
        value: mask.points.map((point) => reanchor(point, from, to)),
      });
    }
  return patches;
}

/** The mapping after the edit, or undefined when it stays as it is. */
function movedMapping(
  document: Document,
  outputId: string,
  mapping: SurfaceMapping,
  from: PixelRect | undefined,
  to: PixelRect | undefined,
  edit: SliceEdit,
): SurfaceMapping | undefined {
  if (mapping.follow !== undefined) {
    if (edit.unlinks?.(mapping.follow) !== true) return undefined;
    return {
      enabled: mapping.enabled,
      corners: reanchorQuad(
        resolvedCorners(document, mapping, outputId),
        from,
        to,
      ),
    };
  }
  if (from === undefined || to === undefined || sameRect(from, to))
    return undefined;
  return { ...mapping, corners: reanchorQuad(mapping.corners, from, to) };
}

function reanchorQuad(
  quad: Quad,
  from: PixelRect | undefined,
  to: PixelRect | undefined,
): Quad {
  if (from === undefined || to === undefined) return quad;
  return Object.fromEntries(
    CORNERS.map((corner) => [corner, reanchor(quad[corner], from, to)]),
  ) as unknown as Quad;
}

function reanchor(point: Point, from: PixelRect, to: PixelRect): Point {
  return toFrame(fromFrame(point, from), to);
}

function sameRect(first: PixelRect, second: PixelRect): boolean {
  return (
    first.x === second.x &&
    first.y === second.y &&
    first.width === second.width &&
    first.height === second.height
  );
}

/**
 * Why `slice` cannot take its Display rectangle: it reaches past the
 * Output's Display Frame on some side. Undefined when it fits. A Slice
 * already past the edge after the Display size shrank stays valid; this is
 * checked only when a rectangle is set.
 */
export function outsideError(
  document: Document,
  slice: Slice,
): string | undefined {
  const size = document.outputs[slice.outputId]?.displaySize;
  if (size === null || size === undefined || insideDisplay(slice.rect, size))
    return undefined;
  return `Slice “${slice.name}” would reach past the ${size.width}×${size.height} Display Frame.`;
}
