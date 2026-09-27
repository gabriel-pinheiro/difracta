import type { DocumentView } from "@difracta/client";
import type { Surface } from "@difracta/core";

import { useMappingOutput } from "@/lib/mapping-output";

import { quadPoints } from "./quad-editor";

const clamp = (aspect: number): number => Math.min(2, Math.max(0.5, aspect));

/**
 * Surface Space has no aspect of its own. The stated Size gives the editors
 * of a Surface's Regions, Masks and Paths their shape; without one, the
 * bounding box of a mapping does, close to what that projector shows, within
 * limits: a Surface that is a thin band in the frame (a ceiling seen at an
 * angle) still needs an editor tall enough to place points in.
 */
export function surfaceAspect(
  surface: Surface | undefined,
  outputId: string | undefined,
): number {
  if (surface === undefined) return 1;
  if (surface.size !== null)
    return clamp(surface.size.width / surface.size.height);
  const mapping =
    outputId === undefined ? undefined : surface.mappings[outputId];
  if (mapping === undefined) return 1;
  const xs = quadPoints(mapping.corners).map((point) => point.x);
  const ys = quadPoints(mapping.corners).map((point) => point.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  if (width <= 0 || height <= 0) return 1;
  return clamp((width / height) * (16 / 9));
}

/** The shape from the Output being calibrated or picked, else the first the Surface is on. */
export function useSurfaceAspect(
  view: DocumentView,
  surface: Surface | undefined,
): number {
  const { outputId, enabled } = useMappingOutput(view, surface?.id);
  return surfaceAspect(surface, outputId ?? enabled[0]?.id);
}
