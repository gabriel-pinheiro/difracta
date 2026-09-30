/**
 * What Difracta Desktop hands its share window as `window.difractaShare`:
 * what needs the operating system to share this computer's screen. Desktop's
 * side of it, and the reason it is a bridge of its own, is
 * `difracta-desktop/src/share-contract.ts`; keep the two in step.
 */

/** Who asks the person which screen or window: the operating system, or this window. */
export type SharePicker = "system" | "own";

export type ShareSourceKind = "screen" | "window";

/** `denied` on a Mac whose Screen Recording permission is off for Difracta. */
export type ScreenAccess = "granted" | "denied" | "unknown";

export interface ShareContext {
  /** The runtime's live socket, `ws://host:port/live`. */
  readonly liveUrl: string;
  /** The runtime as Desktop names it: "This computer", "stage-pc (10.0.0.5:4800)". */
  readonly where: string;
  /** The Sharer's name: the one Desktop's Display Host has. */
  readonly sharer: string;
  /** What the runtime recognises this Sharer by across reconnects. */
  readonly actor: string;
  readonly picker: SharePicker;
  readonly screenAccess: ScreenAccess;
}

/** A screen or window of this computer. Its name stays in this window. */
export interface ShareSourceChoice {
  readonly id: string;
  readonly kind: ShareSourceKind;
  readonly name: string;
  /** A PNG data URL, or null when the operating system gave no picture. */
  readonly thumbnail: string | null;
}

export interface DifractaShare {
  context(): Promise<ShareContext>;
  /** This computer's screens or windows, one kind at a time; empty where the system has its own picker. */
  sources(kind: ShareSourceKind): Promise<ShareSourceChoice[]>;
  /** Which listed source the next capture gets; null for none. False for one not listed. */
  choose(id: string | null): Promise<boolean>;
  /** How many shares this page runs. */
  report(sharing: number): void;
  /** Calls back when Desktop is about to close the window. Returns the unsubscribe. */
  onStopAll(callback: () => void): () => void;
}

declare global {
  interface Window {
    readonly difractaShare?: DifractaShare;
  }
}

export function shareBridge(): DifractaShare | undefined {
  return window.difractaShare;
}
