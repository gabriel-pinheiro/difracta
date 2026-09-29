import type { DocumentView } from "@difracta/client";
import {
  enabledOutputs,
  isEnabledOn,
  type Calibration,
  type Output,
  type Surface,
  type Table,
} from "@difracta/core";
import { useCallback, useMemo, useSyncExternalStore } from "react";

import { useCalibration } from "./calibration";
import { useDocumentPath } from "./client";

/**
 * The Output picked per Surface for editing its mapping and calibrating.
 * Studio-local and never saved: it is where this operator is standing.
 */
const picks = new Map<string, string>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Remembers the pick without moving a running calibration. */
export function pickMappingOutput(
  surfaceId: string,
  outputId: string | undefined,
): void {
  if (picks.get(surfaceId) === outputId) return;
  if (outputId === undefined) picks.delete(surfaceId);
  else picks.set(surfaceId, outputId);
  for (const listener of listeners) listener();
}

/** The Output picked for the Surface, if any; it may no longer be one the Surface is on. */
export function pickedMappingOutput(surfaceId: string): string | undefined {
  return picks.get(surfaceId);
}

/** Notifies when any Surface's pick changes. */
export function subscribeMappingPicks(listener: () => void): () => void {
  return subscribe(listener);
}

/**
 * Which of a Surface's Outputs a mapping edit or a calibration is about: the
 * one showing its pattern now, else the one picked, else the only one it is
 * on. With several and none picked there is none, so nobody aligns on a
 * projector they did not choose.
 */
export function mappingOutput(
  surfaceId: string,
  calibration: Calibration | null,
  picked: string | undefined,
  enabled: readonly Output[],
): string | undefined {
  const on = (outputId: string | undefined): outputId is string =>
    enabled.some((output) => output.id === outputId);
  if (calibration?.surfaceId === surfaceId && on(calibration.outputId))
    return calibration.outputId;
  if (on(picked)) return picked;
  return enabled.length === 1 ? enabled[0]?.id : undefined;
}

/**
 * Where the pattern goes when it follows the selection to another Surface:
 * it stays on the projector being calibrated when that Surface is on it too,
 * moves to the Surface's only Output otherwise, and with several to choose
 * from does not move at all.
 */
export function followedOutput(
  surface: Surface,
  current: string,
): string | undefined {
  if (isEnabledOn(surface, current)) return current;
  const enabled = Object.keys(surface.mappings).filter((outputId) =>
    isEnabledOn(surface, outputId),
  );
  return enabled.length === 1 ? enabled[0] : undefined;
}

export function useMappingOutput(
  view: DocumentView,
  surfaceId: string | undefined,
): {
  readonly outputId: string | undefined;
  /** The Outputs the Surface is on, in Output order. */
  readonly enabled: readonly Output[];
  /** Picks an Output, taking the pattern along while this Surface is calibrated. */
  readonly pick: (outputId: string | undefined) => void;
} {
  const surface = useDocumentPath<Surface>(view, ["surfaces", surfaceId ?? ""]);
  const outputs = useDocumentPath<Table<Output>>(view, ["outputs"]);
  const { calibration, set } = useCalibration(view);
  const picked = useSyncExternalStore(subscribe, () =>
    surfaceId === undefined ? undefined : picks.get(surfaceId),
  );
  const enabled = useMemo(
    () =>
      surface === undefined || outputs === undefined
        ? []
        : enabledOutputs(surface, outputs),
    [surface, outputs],
  );
  const pick = useCallback(
    (outputId: string | undefined): void => {
      if (surfaceId === undefined) return;
      pickMappingOutput(surfaceId, outputId);
      if (
        outputId !== undefined &&
        calibration?.surfaceId === surfaceId &&
        calibration.outputId !== outputId
      )
        set({ ...calibration, outputId });
    },
    [surfaceId, calibration, set],
  );
  return {
    outputId:
      surfaceId === undefined
        ? undefined
        : mappingOutput(surfaceId, calibration, picked, enabled),
    enabled,
    pick,
  };
}
