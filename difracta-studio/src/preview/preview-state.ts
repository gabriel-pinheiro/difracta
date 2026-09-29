import type { DocumentView } from "@difracta/client";
import {
  enabledCorners,
  settings,
  type Document,
  type Point,
  type Surface,
} from "@difracta/core";
import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";

import {
  primarySession,
  sessionList,
  type SessionTable,
} from "@/entities/output/output-live";
import { useDocumentPath } from "@/lib/client";
import {
  pickedMappingOutput,
  subscribeMappingPicks,
} from "@/lib/mapping-output";
import { useStoredState } from "@/lib/storage";
import { useSelection } from "@/selection/selection";

import {
  isAspectChoice,
  previewAspect,
  surfaceAspect,
  type AspectChoice,
} from "./preview-aspect";
import { isRemembered, remember } from "./preview-memory";
import {
  isStoredChoice,
  storedChoice,
  type PreviewChoice,
} from "./preview-choice";
import { previewOutline } from "./preview-outline";
import { framedLayerDisabled } from "./preview-layers";
import {
  framedOn,
  resolvePreview,
  type PreviewTarget,
  type Resolved,
} from "./preview-target";

const CHOICES_KEY = "difracta.preview.choices";
const ASPECTS_KEY = "difracta.preview.aspects";

const isChoices = isRemembered(isStoredChoice);
const isAspects = isRemembered(isAspectChoice);
const NOTHING: Resolved = { target: undefined, notice: undefined };

/** What the picker holds for this Installation, remembered per browser. */
export function usePreviewChoice(
  view: DocumentView,
): readonly [PreviewChoice, (next: PreviewChoice) => void] {
  const installation =
    useDocumentPath<string>(view, ["installation", "id"]) ?? "";
  const [choices, setChoices] = useStoredState(CHOICES_KEY, {}, isChoices);
  const set = useCallback(
    (next: PreviewChoice) =>
      setChoices(
        remember(choices, installation, next, settings.preview.rememberedLimit),
      ),
    [choices, installation, setChoices],
  );
  const stored = choices[installation];
  const choice = useMemo(() => storedChoice(stored), [stored]);
  return [choice, set];
}

/**
 * What `read` makes of the document. Every delta is looked at, and the
 * answer is the same object until it differs, so its reader re-renders only
 * when there is something else to show.
 */
function useDerived<TValue>(
  view: DocumentView,
  read: (document: Document) => TValue,
  fallback: TValue,
): TValue {
  const last = useRef<{ readonly key: string; readonly value: TValue }>(
    undefined,
  );
  const subscribe = useCallback(
    (listener: () => void) => {
      const unsubscribeDocument = view.subscribePath([], listener);
      const unsubscribePicks = subscribeMappingPicks(listener);
      return () => {
        unsubscribeDocument();
        unsubscribePicks();
      };
    },
    [view],
  );
  const snapshot = useCallback(() => {
    const document = view.get();
    const value = document === undefined ? fallback : read(document);
    const key = JSON.stringify([value]);
    if (last.current?.key !== key) last.current = { key, value };
    return last.current.value;
  }, [view, read, fallback]);
  return useSyncExternalStore(subscribe, snapshot);
}

/** What the Preview shows for `choice`, the Scene shown last and the selection. */
export function useResolvedPreview(
  view: DocumentView,
  choice: PreviewChoice,
  sceneId: string | null,
): Resolved {
  const { selection } = useSelection();
  const read = useCallback(
    (document: Document) =>
      resolvePreview({
        document,
        choice,
        sceneId,
        selection,
        picked: pickedMappingOutput,
      }),
    [choice, sceneId, selection],
  );
  return useDerived(view, read, NOTHING);
}

/** The selection's outline in the frame of `target`, if it has one there. */
export function usePreviewOutline(
  view: DocumentView,
  target: PreviewTarget,
): readonly Point[] | undefined {
  const { selection } = useSelection();
  const read = useCallback(
    (document: Document) => previewOutline({ document, target, selection }),
    [target, selection],
  );
  return useDerived(view, read, undefined);
}

/** Whether the Layer shown, if one is, draws nothing because it is disabled. */
export function useFramedLayerDisabled(
  view: DocumentView,
  target: PreviewTarget,
): boolean {
  const layerId = target.framing === "layer" ? target.layerId : undefined;
  const read = useCallback(
    (document: Document) =>
      layerId !== undefined && framedLayerDisabled(document.layers, layerId),
    [layerId],
  );
  return useDerived(view, read, false);
}

/**
 * The ratio the Preview of `target` is drawn at: the one picked for its
 * Output, or a Surface's own shape, which the picker does not change.
 */
export function useTargetAspect(
  view: DocumentView,
  target: PreviewTarget,
): ReturnType<typeof useOutputAspect> {
  const on = framedOn(target);
  const outputId = on.framing === "output" ? on.outputId : on.quadOutputId;
  const output = useOutputAspect(view, outputId ?? "");
  const surface = useDocumentPath<Surface>(view, [
    "surfaces",
    on.framing === "surface" ? on.surfaceId : "",
  ]);
  if (on.framing === "output" || surface === undefined) return output;
  const corners =
    outputId === null ? undefined : enabledCorners(surface, outputId);
  return {
    ...output,
    aspect: surfaceAspect(surface.size, corners, output.aspect),
  };
}

/** The ratio picked for an Output, remembered per browser, and the ratio that makes. */
function useOutputAspect(
  view: DocumentView,
  outputId: string,
): {
  readonly choice: AspectChoice;
  readonly aspect: number;
  readonly pick: (next: AspectChoice) => void;
} {
  const [aspects, setAspects] = useStoredState(ASPECTS_KEY, {}, isAspects);
  const choice = aspects[outputId] ?? "output";
  const reported = useReportedSize(view, outputId);
  const pick = useCallback(
    (next: AspectChoice) =>
      setAspects(
        remember(aspects, outputId, next, settings.preview.rememberedLimit),
      ),
    [aspects, outputId, setAspects],
  );
  return { choice, aspect: previewAspect(choice, reported), pick };
}

/**
 * The size the Output's freshest Output Session reports. Telemetry arrives
 * about once a second; the snapshot is the size as text, so a report with
 * the same size re-renders nothing.
 */
function useReportedSize(
  view: DocumentView,
  outputId: string,
): { readonly width: number; readonly height: number } | undefined {
  const subscribe = useCallback(
    (listener: () => void) =>
      view.subscribePath(["live", "outputs", outputId, "sessions"], listener),
    [view, outputId],
  );
  const size = useSyncExternalStore(subscribe, () => {
    const telemetry = primarySession(
      sessionList(
        view.valueAt<SessionTable>(["live", "outputs", outputId, "sessions"]),
      ),
    )?.telemetry;
    return telemetry == null
      ? undefined
      : `${String(telemetry.width)}x${String(telemetry.height)}`;
  });
  if (size === undefined) return undefined;
  const [width = 0, height = 0] = size.split("x").map(Number);
  return { width, height };
}
