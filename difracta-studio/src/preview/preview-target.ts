import {
  enabledOutputs,
  isEnabledOn,
  orderedEntries,
  resolveTarget,
  type Document,
  type Layer,
  type Surface,
} from "@difracta/core";

import { followedOutput } from "../lib/mapping-output";
import type { Selection } from "@/selection/selection";
import { selectionSurface } from "../selection/selection-surface";

import type { PreviewChoice } from "./preview-choice";

/** An Output as its projector gets it. */
export interface OutputTarget {
  readonly framing: "output";
  readonly outputId: string;
  /** The Scene shown in place of the active one, null for the active one. */
  readonly sceneId: string | null;
}

/** A Surface flat, filling the frame. */
export interface SurfaceTarget {
  readonly framing: "surface";
  readonly surfaceId: string;
  /** The Output whose mapping gives a Surface without a size its shape. */
  readonly quadOutputId: string | null;
  /** The Scene shown in place of the active one, null for the active one. */
  readonly sceneId: string | null;
}

/**
 * A Layer and only what it draws with, `on` the Surface of a Visual Layer's
 * Target flat, or on an Output for a Filter Layer or a Group.
 */
export interface LayerTarget {
  readonly framing: "layer";
  readonly layerId: string;
  readonly on: OutputTarget | SurfaceTarget;
}

/** What the Preview frames. */
export type PreviewTarget = OutputTarget | SurfaceTarget | LayerTarget;

/** The Output or the flat Surface the target is drawn on. */
export function framedOn(target: PreviewTarget): OutputTarget | SurfaceTarget {
  return target.framing === "layer" ? target.on : target;
}

/** Why following the selection left the Preview where it was, when that needs saying. */
export type PreviewNotice =
  | {
      readonly kind: "several";
      readonly surfaceName: string;
      /** The Outputs the Surface is on, in Output order. */
      readonly outputs: readonly {
        readonly id: string;
        readonly name: string;
      }[];
    }
  | { readonly kind: "unmapped"; readonly surfaceName: string };

export type PreviewTables = Pick<
  Document,
  | "installation"
  | "outputs"
  | "surfaces"
  | "regions"
  | "masks"
  | "paths"
  | "outputMasks"
  | "scenes"
  | "layers"
>;

export interface Resolved {
  /** Undefined while there is no Output and no Surface to show flat. */
  readonly target: PreviewTarget | undefined;
  readonly notice: PreviewNotice | undefined;
}

/**
 * What the Preview shows. A named Output is shown whatever is selected, with
 * the active Scene. Following, the selection moves the Preview when it names
 * something to show: an Output itself or one of its Output Masks, or the
 * Surface a Surface, Region, Mask, Path or Visual Layer is or draws on, which
 * is shown flat when the framing allows and on its Output otherwise. In Layer framing a selected
 * Layer is shown with only what it draws with: a Visual Layer on its
 * Target's Surface flat, a Filter Layer or a Group on the Output shown, and
 * it stays shown until something else is. A Scene, or the Scene of a
 * Layer, is shown whether it plays or not, and stays shown until another is
 * selected. Anything else leaves the Preview where it is, and so does a
 * Surface on several Outputs with none to prefer, which is reported rather
 * than guessed. With nothing shown yet, or the Output shown gone, the
 * Preview starts on the first Output.
 */
export function resolvePreview({
  document,
  choice,
  sceneId,
  selection,
  picked,
}: {
  readonly document: PreviewTables;
  readonly choice: PreviewChoice;
  /** The Scene shown last in place of the active one, if one was. */
  readonly sceneId: string | null;
  readonly selection: Selection | undefined;
  /** The Output picked for a Surface in its inspector, if any. */
  readonly picked: (surfaceId: string) => string | undefined;
}): Resolved {
  const current =
    choice.outputId !== null && choice.outputId in document.outputs
      ? choice.outputId
      : undefined;
  const shown = current ?? orderedEntries(document.outputs)[0]?.id;
  if (!choice.follow)
    return {
      target:
        shown === undefined
          ? undefined
          : { framing: "output", outputId: shown, sceneId: null },
      notice: undefined,
    };
  const scene = shownScene(document, selection, sceneId);
  const flat = choice.framing !== "output";
  const onOutput = (outputId: string): OutputTarget => ({
    framing: "output",
    outputId,
    sceneId: scene,
  });
  const onSurface = (surface: Surface): SurfaceTarget => ({
    framing: "surface",
    surfaceId: surface.id,
    quadOutputId:
      surfaceOutput(document, surface, current, picked(surface.id)) ??
      enabledOutputs(surface, document.outputs)[0]?.id ??
      null,
    sceneId: scene,
  });
  const onLayer = (layer: Layer | undefined): LayerTarget | undefined => {
    if (layer === undefined) return undefined;
    const surface =
      layer.kind === "visual"
        ? resolveTarget(document, layer.target)?.surface
        : undefined;
    const on =
      surface !== undefined
        ? onSurface(surface)
        : layer.kind !== "visual" && shown !== undefined
          ? onOutput(shown)
          : undefined;
    return on === undefined
      ? undefined
      : { framing: "layer", layerId: layer.id, on };
  };
  const stay = (notice?: PreviewNotice): Resolved => {
    const layer =
      choice.framing === "layer" &&
      choice.layerId !== null &&
      selection?.kind !== "scene"
        ? document.layers[choice.layerId]
        : undefined;
    const keptLayer =
      layer?.sceneId === (scene ?? document.installation.activeScene)
        ? onLayer(layer)
        : undefined;
    const kept =
      flat && choice.surfaceId !== null
        ? document.surfaces[choice.surfaceId]
        : undefined;
    return {
      target:
        keptLayer ??
        (kept !== undefined
          ? onSurface(kept)
          : shown === undefined
            ? undefined
            : onOutput(shown)),
      notice,
    };
  };
  const selectedOutput =
    selection?.kind === "output"
      ? selection.id
      : selection?.kind === "outputMask"
        ? document.outputMasks[selection.id]?.outputId
        : undefined;
  if (selectedOutput !== undefined)
    return selectedOutput in document.outputs
      ? { target: onOutput(selectedOutput), notice: undefined }
      : stay();
  if (choice.framing === "layer" && selection?.kind === "layer") {
    const target = onLayer(document.layers[selection.id]);
    if (target !== undefined) return { target, notice: undefined };
  }
  const surface = selectedSurface(document, selection);
  if (surface === undefined) return stay();
  if (flat) return { target: onSurface(surface), notice: undefined };
  const outputId = surfaceOutput(
    document,
    surface,
    current,
    picked(surface.id),
  );
  if (outputId !== undefined)
    return { target: onOutput(outputId), notice: undefined };
  const outputs = enabledOutputs(surface, document.outputs);
  return stay(
    outputs.length === 0
      ? { kind: "unmapped", surfaceName: surface.name }
      : {
          kind: "several",
          surfaceName: surface.name,
          outputs: outputs.map(({ id, name }) => ({ id, name })),
        },
  );
}

/**
 * The Scene shown in place of the active one: the selected Scene or the
 * selected Layer's, else the one shown last. Null once that is the active
 * Scene, so the Preview goes on with whatever plays next.
 */
function shownScene(
  document: PreviewTables,
  selection: Selection | undefined,
  last: string | null,
): string | null {
  const selected =
    selection?.kind === "scene"
      ? selection.id
      : selection?.kind === "layer"
        ? document.layers[selection.id]?.sceneId
        : undefined;
  const sceneId =
    selected !== undefined && selected in document.scenes ? selected : last;
  return sceneId === null ||
    !(sceneId in document.scenes) ||
    sceneId === document.installation.activeScene
    ? null
    : sceneId;
}

/** The Surface a selection is, is part of, or draws on. */
function selectedSurface(
  document: PreviewTables,
  selection: Selection | undefined,
): Surface | undefined {
  if (selection?.kind !== "layer")
    return selectionSurface(selection, document)?.surface;
  const layer = document.layers[selection.id];
  return layer?.kind === "visual"
    ? resolveTarget(document, layer.target)?.surface
    : undefined;
}

/**
 * The Output a Surface is previewed on: the one shown now when the Surface
 * is on it, else the one picked for it, else the only one it is on.
 */
function surfaceOutput(
  document: PreviewTables,
  surface: Surface,
  current: string | undefined,
  picked: string | undefined,
): string | undefined {
  const on = (outputId: string | undefined): outputId is string =>
    outputId !== undefined &&
    outputId in document.outputs &&
    isEnabledOn(surface, outputId);
  if (on(current)) return current;
  if (on(picked)) return picked;
  const only = followedOutput(surface, current ?? "");
  return on(only) ? only : undefined;
}
