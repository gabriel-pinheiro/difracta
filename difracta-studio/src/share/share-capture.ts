import { captureConstraints } from "@difracta/core";

import type { DifractaShare } from "./share-bridge";
import type { Captured } from "./share-sending";
import type { ShareChoices } from "./sharer";

export type CaptureResult =
  | { readonly kind: "captured"; readonly captured: Captured }
  /** The person closed the system's picker without choosing. */
  | { readonly kind: "cancelled" }
  | { readonly kind: "failed"; readonly reason: string };

/** How a capture the system or Desktop refused is reported to the page. */
const REFUSALS = new Set(["NotAllowedError", "AbortError"]);

/**
 * Captures a screen or a window of this computer. `sourceId` is the one
 * chosen in this window's own picker, which Desktop is told before the
 * capture is asked for; without it the system's picker asks, and Desktop
 * grants what it returns. A system picker closed without a choice reaches
 * the page as a refusal, which is nothing to report.
 */
export async function captureSource(
  bridge: DifractaShare,
  choices: ShareChoices,
  sourceId: string | undefined,
  media: Pick<MediaDevices, "getDisplayMedia"> = navigator.mediaDevices,
): Promise<CaptureResult> {
  if (sourceId !== undefined && !(await bridge.choose(sourceId)))
    return {
      kind: "failed",
      reason: "That screen or window is no longer there. Choose again.",
    };
  try {
    const stream = await media.getDisplayMedia({
      video: captureConstraints(choices.quality, choices.cursor),
      audio: false,
    });
    const [track] = stream.getVideoTracks();
    if (track === undefined)
      return { kind: "failed", reason: "The capture has no picture." };
    return { kind: "captured", captured: { stream, track } };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (sourceId === undefined && REFUSALS.has(name))
      return { kind: "cancelled" };
    return {
      kind: "failed",
      reason: `The capture could not start: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
