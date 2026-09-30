/**
 * What the share preload exposes to the share window's page as
 * `window.difractaShare`, and the IPC channels behind it. A bridge of its
 * own, given to that one page of Desktop's and to no page a runtime serves:
 * it lists this computer's screens and windows and says which of them the
 * page's next capture gets.
 *
 * It carries what needs the operating system and nothing else. The page is
 * a client of the runtime like Studio: it reads the Installation's Screen
 * Shares, declares its shares and creates a slot over its own connection.
 *
 * The page declares the same shape in
 * `difracta-studio/src/share/share-bridge.ts`; keep the two in step.
 */

/** Who asks the person which screen or window: the operating system, or the share window. */
export type SharePicker = "system" | "own";

export type ShareSourceKind = "screen" | "window";

/**
 * Whether the operating system lets Desktop capture the screen: `denied` on
 * a Mac whose Screen Recording permission is off for Difracta, `unknown`
 * where nothing says.
 */
export type ScreenAccess = "granted" | "denied" | "unknown";

/** What the page needs to be a Sharer of the session's runtime. */
export interface ShareContext {
  /** The runtime's live socket, `ws://host:port/live`. */
  readonly liveUrl: string;
  /** The runtime as Desktop names it: "This computer", "stage-pc (10.0.0.5:4800)". */
  readonly where: string;
  /** The Sharer's name: the one Desktop's Display Host has. */
  readonly sharer: string;
  /** What the runtime recognises this Sharer by across reconnects, kept between launches. */
  readonly actor: string;
  readonly picker: SharePicker;
  readonly screenAccess: ScreenAccess;
}

/** A screen or window of this computer, for the share window's own picker. Its name never leaves the machine. */
export interface ShareSourceChoice {
  readonly id: string;
  readonly kind: ShareSourceKind;
  readonly name: string;
  /** A PNG data URL, or null when the operating system gave no picture. */
  readonly thumbnail: string | null;
}

export interface DifractaShare {
  context(): Promise<ShareContext>;
  /**
   * This computer's screens or windows, for the share window's own picker.
   * Asked one kind at a time: windows can take seconds to list, and screens
   * should not wait for them. Empty where the system has its own picker.
   */
  sources(kind: ShareSourceKind): Promise<ShareSourceChoice[]>;
  /**
   * Which of the listed sources the page's next capture gets; null for
   * none. False for an id that was not listed.
   */
  choose(id: string | null): Promise<boolean>;
  /** How many shares the page runs, which Desktop asks about before quitting and hides the window for. */
  report(sharing: number): void;
  /** Calls back when Desktop is about to close the window: stop every share. Returns the unsubscribe. */
  onStopAll(callback: () => void): () => void;
}

export const shareChannels = {
  context: "difracta-share:context",
  sources: "difracta-share:sources",
  choose: "difracta-share:choose",
  report: "difracta-share:report",
  stopAll: "difracta-share:stop-all",
} as const;
