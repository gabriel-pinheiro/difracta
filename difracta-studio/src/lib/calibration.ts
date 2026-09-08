import type { DocumentView } from "@difracta/client";
import type { Calibration } from "@difracta/core";
import { useCallback } from "react";

import { useClient, useCommand, useDocumentPath, useSignal } from "./client";

export type CalibrationState = Omit<Calibration, "owner">;

/**
 * Calibration Mode as this Studio sees and drives it. `set` stamps this
 * session as owner, so the runtime clears the mode if the browser goes away
 * mid-alignment. Performance commands: immediate, not undoable.
 */
export function useCalibration(view: DocumentView): {
  readonly calibration: Calibration | null;
  readonly set: (state: CalibrationState) => void;
  readonly exit: () => void;
} {
  const client = useClient();
  const owner = useSignal(client.sessionId);
  const command = useCommand(view);
  const calibration =
    useDocumentPath<Calibration | null>(view, ["operational", "calibration"]) ??
    null;
  const set = useCallback(
    (state: CalibrationState): void => {
      if (owner === undefined) return;
      void command("calibration.set", { ...state, owner });
    },
    [command, owner],
  );
  const exit = useCallback((): void => {
    void command("calibration.exit", {});
  }, [command]);
  return { calibration, set, exit };
}

/** The Calibration Mode entry when it shows this Surface, or this Mask of it. */
export function calibrationFor(
  calibration: Calibration | null,
  surfaceId: string,
  maskId: string | null,
): Calibration | undefined {
  return calibration !== null &&
    calibration.surfaceId === surfaceId &&
    calibration.maskId === maskId
    ? calibration
    : undefined;
}
