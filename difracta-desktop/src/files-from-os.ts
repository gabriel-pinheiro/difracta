import type { BrowserWindow } from "electron";

import { mayLeaveRemoteFor } from "./file-from-os-prompt.ts";
import type { Session } from "./session.ts";
import { requestOpen } from "./studio-window.ts";

/** What `desktop-modes.ts` lets a file from the OS do. */
export interface FileDestinations {
  /** A session is starting or being left. */
  busy(): boolean;
  session(): Session | undefined;
  /** Starts local mode with the file, from no session at all. */
  runLocal(file: string): void;
  /** The session's Studio window, opened if it was not. */
  showStudio(session: Session): BrowserWindow;
  /** Leaves a runtime elsewhere for this computer; the person agreed. */
  switchToLocal(file: string, session: Session): Promise<void>;
}

/**
 * A `.difracta` file the OS wants open (a command line, a second launch,
 * `open-file` on macOS), which always means this computer: a path on this
 * disk means nothing to a runtime elsewhere.
 *
 *   no session           → local mode starts with it
 *   local, Studio open   → Studio's own Open, unsaved-changes question included
 *   local, no window     → opened in the runtime directly; with unsaved changes
 *                          the Studio window is shown instead, and Studio asks
 *   remote               → asked first, since it means leaving that runtime
 *   busy                 → kept until the session is there
 */
export class FilesFromOs {
  readonly #to: FileDestinations;
  #pending: string | undefined;

  constructor(destinations: FileDestinations) {
    this.#to = destinations;
  }

  open(file: string): void {
    const session = this.#to.session();
    if (this.#to.busy()) this.#pending = file;
    else if (session === undefined) this.#to.runLocal(file);
    else if (session.bridgeOrigin !== undefined)
      void this.#openLocally(file, session);
    else void this.#leaveRemoteFor(file, session);
  }

  /** The file that arrived while Desktop was busy gets its turn. */
  openPending(): void {
    const file = this.#pending;
    this.#pending = undefined;
    if (file !== undefined) this.open(file);
  }

  async #openLocally(file: string, session: Session): Promise<void> {
    if (session.window === undefined && (await session.openWithoutStudio(file)))
      return;
    if (this.#to.session() === session)
      requestOpen(this.#to.showStudio(session), file);
  }

  async #leaveRemoteFor(file: string, session: Session): Promise<void> {
    const window = this.#to.showStudio(session);
    if (window.isMinimized()) window.restore();
    window.focus();
    const yes = await mayLeaveRemoteFor(window, file, session.where);
    if (yes && this.#to.session() === session && !this.#to.busy())
      await this.#to.switchToLocal(file, session);
  }
}
