import { settings } from "@difracta/core";
import type { ShareLive, ShareSource } from "@difracta/protocol";

/** Where the Sharer starts a share: Difracta Desktop's menu item, in its words. */
export const SHARE_MENU_ITEM = "File ▸ Share Screen...";

export interface ShareStatusText {
  /** The word the navigator row shows. */
  readonly word: "idle" | "live" | "interrupted";
  readonly label: string;
  readonly explanation: string;
}

/** The colour of each status word, in the navigator, the inspector and the status strip. */
export const shareStatusTone: Readonly<
  Record<ShareStatusText["word"], string>
> = {
  idle: "text-muted-foreground",
  live: "text-emerald-400",
  interrupted: "text-amber-300",
};

/** A Screen Share's status in the words the navigator and its inspector use. */
export function describeShare(state: ShareLive): ShareStatusText {
  switch (state.status) {
    case "idle":
      return {
        word: "idle",
        label: "Idle",
        explanation: `Nobody shares into it. On the computer whose screen or window to show, in Difracta Desktop, choose ${SHARE_MENU_ITEM} and pick this Screen Share.`,
      };
    case "live":
      return {
        word: "live",
        label: "Live",
        explanation: `${state.sharer} shares ${sourceText(state.source)} into it.`,
      };
    case "interrupted":
      return {
        word: "interrupted",
        label: "Interrupted",
        explanation: `${state.sharer}'s connection to the runtime dropped. The Outputs keep the picture while it still arrives; the share ends if ${state.sharer} is not back within ${String(settings.shares.interruptedForMs / 1000)} s.`,
      };
  }
}

/** "a screen", "a window". */
export function sourceText(source: ShareSource): string {
  return source === "screen" ? "a screen" : "a window";
}

/**
 * When a share started, as the time of day and how long ago: "21:04, for 5
 * min". `since` is the runtime's clock, which may be another computer's, so
 * a start that looks ahead of `now` reads as just now.
 */
export function sinceText(since: number, now: number): string {
  const time = new Date(since).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const seconds = Math.max(0, Math.round((now - since) / 1000));
  if (seconds < 60) return `${time}, for ${String(seconds)} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${time}, for ${String(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  return `${time}, for ${String(hours)} h ${String(minutes % 60)} min`;
}

/** "1 Viewer", "3 Viewers", out of how many a share takes. */
export function viewersText(viewers: number): string {
  return `${String(viewers)} ${viewers === 1 ? "Viewer" : "Viewers"} of ${String(settings.shares.maxViewers)} a share takes`;
}
