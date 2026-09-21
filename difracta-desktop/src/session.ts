import type { BrowserWindow } from "electron";

import type { LastMode } from "./desktop-state.ts";
import type { Leaving } from "./output-sessions.ts";
import type { MayClose } from "./studio-window.ts";

/**
 * One stay with one runtime: from the moment main is connected to it until
 * Desktop quits or switches to another. `local-session.ts` and
 * `remote-session.ts` make them; main holds at most one. Its Studio window is
 * opened by `desktop-modes.ts`, at once or, for a session started without
 * it, when a person asks.
 */
export interface Session {
  /** Where Studio is coming from, as Desktop's questions say it: "This computer", "stage-pc (10.0.0.5:4800)". */
  readonly where: string;
  /** The origin Studio is loaded from, `http://host:port`: what its window is confined to, and what tells two runtimes apart. */
  readonly origin: string;
  /** What the next launch resumes; undefined for a stay that is not resumed. */
  readonly resume: LastMode | undefined;
  /**
   * Started with `--no-studio` or its setting: Desktop goes on without the
   * Studio window, so closing that window closes it and nothing else.
   */
  readonly withoutStudio: boolean;
  /** The Studio window, while it is open. */
  readonly window: BrowserWindow | undefined;
  /** Opens the Studio window unless it is open; `mayClose` is asked before it closes. */
  showWindow(mayClose: MayClose): BrowserWindow;
  /**
   * The origin whose pages get the document bridge (`window.difractaDesktop`):
   * the local runtime's, and undefined for a runtime elsewhere, to which a
   * path on this disk means nothing.
   */
  readonly bridgeOrigin: string | undefined;
  /** The open file, else the last one: where a file dialog starts. */
  currentFile(): string | undefined;
  /**
   * A file from the OS while there is no Studio window to hand it to: opened
   * in the runtime directly. False when that is Studio's to do after all,
   * because it means a question (unsaved changes) or an error to show.
   */
  openWithoutStudio(file: string): Promise<boolean>;
  /**
   * Asked before the session is left, by a quit and by a switch alike; false
   * stays. `over` is the window the questions belong to; with none open,
   * nobody is there to ask.
   */
  mayLeave(over: BrowserWindow | undefined, leaving: Leaving): Promise<boolean>;
  /** Drops the link and stops what the session started. Its windows are closed by then. */
  end(): Promise<void>;
}

export type SessionStart =
  | { readonly ok: true; readonly session: Session }
  | { readonly ok: false; readonly reason: string };
