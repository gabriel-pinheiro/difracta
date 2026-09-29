import { FULL_FRAME, type Document, type Surface } from "@difracta/core";

import { framedLayers } from "./preview-layers";
import type { PreviewTarget } from "./preview-target";

/** What the compositor is handed for a frame of the Preview. */
export interface PreviewFrame {
  readonly document: Document;
  readonly outputId: string;
}

/** The Output a Surface shown flat is rendered on; it is in no document. */
const FLAT_OUTPUT = "preview";

/**
 * An id for the flat Output that names no Output of the document and no
 * mapping a Surface keeps, whatever ids a file brought.
 */
export function flatOutputId(
  document: Pick<Document, "outputs" | "surfaces">,
): string {
  const taken = (id: string): boolean =>
    id in document.outputs ||
    Object.values(document.surfaces).some((surface) => id in surface.mappings);
  let id = FLAT_OUTPUT;
  while (taken(id)) id = `${id}_`;
  return id;
}

/**
 * The Preview's copy of the document and the Output to render from it.
 * Blackout is lifted: the Preview keeps showing what the Outputs would. A
 * Scene shown in place of the active one is made the active one. An Output
 * is rendered as its projector gets it, Calibration Mode included. A Surface
 * is rendered on an Output of the copy alone, where only it is mapped and
 * fills the frame, so Filter Layers transform it alone and Calibration Mode,
 * which is on a real Output, does not show. A Layer is rendered on its
 * Surface or Output with only the Layers `framedLayers` keeps. Everything
 * not changed is shared with `document`.
 */
export function previewFrame(
  document: Document,
  target: PreviewTarget,
): PreviewFrame {
  if (target.framing === "layer") {
    const frame = previewFrame(document, target.on);
    const layers = framedLayers(document.layers, target.layerId);
    return layers === document.layers
      ? frame
      : { ...frame, document: { ...frame.document, layers } };
  }
  let copy = document;
  if (copy.operational.blackout)
    copy = { ...copy, operational: { ...copy.operational, blackout: false } };
  if (target.sceneId !== null && target.sceneId in copy.scenes)
    copy = {
      ...copy,
      installation: { ...copy.installation, activeScene: target.sceneId },
    };
  if (target.framing === "output")
    return { document: copy, outputId: target.outputId };
  const outputId = flatOutputId(document);
  const surface = document.surfaces[target.surfaceId];
  if (surface !== undefined)
    copy = {
      ...copy,
      surfaces: {
        ...copy.surfaces,
        [surface.id]: flatSurface(surface, outputId),
      },
    };
  return { document: copy, outputId };
}

const flattened = new WeakMap<
  Surface,
  { readonly outputId: string; readonly surface: Surface }
>();

/** The Surface filling the frame of `outputId`; the same copy for the same Surface. */
function flatSurface(surface: Surface, outputId: string): Surface {
  const known = flattened.get(surface);
  if (known?.outputId === outputId) return known.surface;
  const flat: Surface = {
    ...surface,
    mappings: {
      ...surface.mappings,
      [outputId]: { enabled: true, corners: FULL_FRAME },
    },
  };
  flattened.set(surface, { outputId, surface: flat });
  return flat;
}

/**
 * `previewFrame` that answers with the same copy while it is asked about the
 * same document and target, so a frame that would repeat itself is still
 * recognised by the compositor.
 */
export function previewFrames(): (
  document: Document,
  target: PreviewTarget,
) => PreviewFrame {
  let last:
    | {
        readonly document: Document;
        readonly target: PreviewTarget;
        readonly frame: PreviewFrame;
      }
    | undefined;
  return (document, target) => {
    if (last?.document !== document || !sameTarget(last.target, target))
      last = { document, target, frame: previewFrame(document, target) };
    return last.frame;
  };
}

/** Whether two targets render the same; the Output a shape is read from does not count. */
function sameTarget(first: PreviewTarget, second: PreviewTarget): boolean {
  if (first.framing === "layer")
    return (
      second.framing === "layer" &&
      first.layerId === second.layerId &&
      sameTarget(first.on, second.on)
    );
  if (second.framing === "layer" || first.sceneId !== second.sceneId)
    return false;
  if (first.framing === "output")
    return second.framing === "output" && first.outputId === second.outputId;
  return second.framing === "surface" && first.surfaceId === second.surfaceId;
}
