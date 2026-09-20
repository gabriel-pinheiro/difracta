import type { BrowserWindow } from "electron";

import type { LastMode } from "./desktop-state.ts";

/**
 * One stay with one runtime: from the moment its Studio window opens until
 * Desktop quits or switches to another. `local-session.ts` and
 * `remote-session.ts` make them; main holds at most one.
 */
export interface Session {
  /** Where Studio is coming from, as Desktop's questions say it: "This computer", "stage-pc (10.0.0.5:4800)". */
  readonly where: string;
  /** The origin Studio is loaded from, `http://host:port`: what its window is confined to, and what tells two runtimes apart. */
  readonly origin: string;
  /** What the next launch resumes; undefined for a stay that is not resumed. */
  readonly resume: LastMode | undefined;
  readonly window: BrowserWindow;
  /**
   * The origin whose pages get the document bridge (`window.difractaDesktop`):
   * the local runtime's, and undefined for a runtime elsewhere, to which a
   * path on this disk means nothing.
   */
  readonly bridgeOrigin: string | undefined;
  /** The open file, else the last one: where a file dialog starts. */
  currentFile(): string | undefined;
  /** Asked before switching away, as closing the window asks; false stays. `over` is the window the question belongs to. */
  mayLeave(over: BrowserWindow): Promise<boolean>;
  /** Drops the link and stops what the session started. Its windows are closed by then. */
  end(): Promise<void>;
}

export type SessionStart =
  | { readonly ok: true; readonly session: Session }
  | { readonly ok: false; readonly reason: string };
