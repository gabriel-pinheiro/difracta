import { app, BrowserWindow } from "electron";
import path from "node:path";

import { ApplicationMenu } from "./application-menu.ts";
import { switchSession } from "./connect-to.ts";
import { withLastMode, type DesktopStateStore } from "./desktop-state.ts";
import { registerFileDialogs } from "./file-dialogs.ts";
import { FilesFromOs } from "./files-from-os.ts";
import type { LaunchResult } from "./launch-contract.ts";
import { LaunchPage } from "./launch-page.ts";
import type { LaunchRuntimes } from "./launch-runtimes.ts";
import {
  checkTarget,
  isCurrentTarget,
  launchCurrent,
  type LaunchTarget,
} from "./launch-target.ts";
import { startLocalSession } from "./local-session.ts";
import { QuitGate } from "./quit-gate.ts";
import { startRemoteSession } from "./remote-session.ts";
import { parseRuntimeAddress } from "./runtime-address.ts";
import type { RuntimeProcess } from "./runtime-process.ts";
import type { Session, SessionStart } from "./session.ts";
import type { StartUpMode } from "./start-up-mode.ts";
import { StartupSettings } from "./startup-settings.ts";
import { openStudioWindow } from "./studio-visit.ts";
import { StudioZoom } from "./studio-zoom.ts";

export interface DesktopModesOptions {
  readonly distDir: string;
  readonly runtime: RuntimeProcess;
  readonly state: DesktopStateStore;
  readonly runtimes: LaunchRuntimes;
}

const BUSY = "Difracta is already starting a Runtime.";

/**
 * Which of its three faces Desktop shows, and the way from one to the next:
 *
 *   launch page ── Run on this computer ──▶ local session ──┐
 *        ▲    └─── Connect to a Runtime ──▶ remote session ─┤
 *        └──────────── File ▸ Connect to... ◀───────────────┘
 *
 * There is one session at most. On the first launch the launch page is all
 * there is; from File ▸ Connect to... it opens over the running session,
 * which goes on until another target is chosen there (`connect-to.ts` has the
 * order of that), so a runtime is never started while another is stopping.
 *
 * A session is left in one way, whoever asks: `Session.mayLeave` first (the
 * questions of `leave-checks.ts`), by a quit through the quit gate and by a
 * switch through `#leave`. Its Studio window is `studio-visit.ts`'s, and a
 * file from the OS is `files-from-os.ts`'s.
 */
export class DesktopModes {
  readonly #options: DesktopModesOptions;
  readonly #menu: ApplicationMenu;
  readonly #launchPage: LaunchPage;
  #session: Session | undefined;
  /** A session is starting or being left; whatever else is asked waits or is refused. */
  #busy = false;
  readonly #files: FilesFromOs;
  readonly #quit = new QuitGate(() => this.#mayQuit());

  constructor(options: DesktopModesOptions) {
    this.#options = options;
    registerFileDialogs({
      origin: () => this.#session?.bridgeOrigin,
      window: () => this.#session?.window,
      currentFile: () => this.#session?.currentFile(),
    });
    this.#launchPage = new LaunchPage(options, {
      current: () => launchCurrent(this.#session),
      runLocal: () => this.#choose({ kind: "local" }),
      connect: (address) => this.#connect(address),
    });
    this.#menu = new ApplicationMenu({
      runtimeLog: options.runtime.logFile,
      onConnectTo: () => this.connectTo(),
      startup: new StartupSettings(options.state),
      zoom: new StudioZoom(options.state),
    });
    this.#files = new FilesFromOs({
      busy: () => this.#busy,
      session: () => this.#session,
      runLocal: (file) => void this.#runLocal(file),
      showStudio: (session) => this.#showStudio(session),
      switchToLocal: (file) => this.#switchToLocal(file),
    });
  }

  async startUp(mode: StartUpMode): Promise<void> {
    if (mode.kind === "launch-page") this.#showLaunchPage(null);
    else if (mode.kind === "local")
      await this.#runLocal(mode.file, { studioWindow: mode.studioWindow });
    else if (mode.kind === "remote") await this.#enter(this.#remote(mode));
    else await this.#runLocal(mode.file, { studioUrl: mode.url });
  }

  /** A file the OS wants open: always on this computer. */
  openFromOs(file: string): void {
    this.#files.open(file);
  }

  /**
   * Brings Desktop to the front: a second launch, a click on the macOS Dock.
   * For a session running without its Studio window this is the way back to
   * one: the window is opened.
   */
  focus(): void {
    const session = this.#session;
    // The launch page, when open, is in front of Studio.
    const window =
      this.#launchPage.window ??
      (session === undefined ? undefined : this.#showStudio(session));
    if (window === undefined) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  }

  /** The app's `before-quit`: every quit passes the gate, whatever asked for it. */
  beforeQuit(event: { preventDefault(): void }): void {
    // `setImmediate`: Electron ignores a quit asked for inside the one being cancelled.
    this.#quit.beforeQuit(event, () => setImmediate(() => app.quit()));
  }

  /** File ▸ Connect to...: the launch page, over the session, which goes on. */
  connectTo(): void {
    if (this.#busy || this.#session === undefined) return;
    this.#showLaunchPage(null);
    this.focus();
  }

  /** The last thing before exit: the link closed, the runtime stopped and waited for. */
  async end(): Promise<void> {
    await this.#session?.end();
    await this.#options.runtime.stop();
  }

  async #runLocal(
    file: string | undefined,
    how: { readonly studioUrl?: string; readonly studioWindow?: boolean } = {},
  ): Promise<LaunchResult> {
    const { runtime, state, runtimes, distDir } = this.#options;
    const { studioUrl } = how;
    const dev =
      studioUrl === undefined ? undefined : parseRuntimeAddress(studioUrl);
    if (dev?.ok === false) return this.#enter(() => Promise.resolve(dev));
    // From now on the runtime this starts is not one to connect to.
    if (dev === undefined) runtimes.setLocalPort(runtime.port);
    const result = await this.#enter(() =>
      startLocalSession({
        runtime,
        state,
        file,
        studioWindow: how.studioWindow ?? true,
        preload: path.join(distDir, "preload.cjs"),
        ...(dev === undefined ? {} : { devOrigin: dev.origin }),
      }),
    );
    if (!result.ok) runtimes.setLocalPort(undefined);
    return result;
  }

  async #connect(address: string): Promise<LaunchResult> {
    const parsed = parseRuntimeAddress(address);
    if (!parsed.ok) return parsed;
    const { origin } = parsed;
    const name = await this.#launchPage.knownName(origin);
    return this.#choose({ kind: "remote", origin, name });
  }

  #remote(target: {
    readonly origin: string;
    readonly name: string | null;
  }): () => Promise<SessionStart> {
    const preload = path.join(this.#options.distDir, "menu-preload.cjs");
    const { state } = this.#options;
    return () => startRemoteSession({ ...target, preload, state });
  }

  /**
   * A choice on the launch page. With no session it simply starts. Over a
   * session it is a switch: checked first, then the session is left, its
   * question asked, then the new one starts. Choosing what is in use, or
   * cancelling that question, closes the launch page and changes nothing.
   */
  async #choose(target: LaunchTarget): Promise<LaunchResult> {
    const start = (): Promise<LaunchResult> =>
      target.kind === "local"
        ? this.#runLocal(undefined)
        : this.#enter(this.#remote(target));
    const session = this.#session;
    if (session === undefined) return start();
    if (this.#busy) return { ok: false, reason: BUSY };

    this.#busy = true;
    const outcome = await switchSession({
      isCurrent: isCurrentTarget(session, target),
      check: () => checkTarget(target, this.#options.runtime),
      leave: () => this.#leave(),
      start: () => {
        this.#busy = false;
        return start();
      },
    }).finally(() => {
      this.#busy = false;
    });
    if (outcome.kind === "current" || outcome.kind === "stayed")
      this.#launchPage.close();
    // A switch that started something has passed the file on already (`#enter`).
    this.#files.openPending();
    return outcome.kind === "refused" || outcome.kind === "failed"
      ? { ok: false, reason: outcome.reason }
      : { ok: true };
  }

  /**
   * Starts a session unless one is there or on its way. A failure is the
   * launch page's to show: it gets the result when it asked, and is opened
   * with the reason when nobody was there to ask (a resume, a file).
   */
  async #enter(start: () => Promise<SessionStart>): Promise<LaunchResult> {
    if (this.#busy || this.#session !== undefined)
      return { ok: false, reason: BUSY };
    this.#busy = true;
    let result: LaunchResult;
    try {
      const started = await start();
      if (started.ok) this.#adopt(started.session);
      result = started.ok ? { ok: true } : started;
    } catch (error) {
      result = {
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    } finally {
      this.#busy = false;
    }
    if (!result.ok && this.#launchPage.window === undefined)
      this.#showLaunchPage(result.reason);

    this.#files.openPending();
    return result;
  }

  #showStudio(session: Session): BrowserWindow {
    return openStudioWindow(session, {
      menu: this.#menu,
      quit: this.#quit,
      isCurrent: () => this.#session === session,
    });
  }

  #adopt(session: Session): void {
    this.#session = session;
    if (!session.withoutStudio) this.#showStudio(session);
    this.#launchPage.close();

    const { resume } = session;
    if (resume !== undefined)
      void this.#options.state.update((state) => withLastMode(state, resume));
  }

  /** Whether Desktop may quit: the session's questions, asked of whoever is in front of it. */
  async #mayQuit(): Promise<boolean> {
    const session = this.#session;
    // Mid-switch the questions were asked already, or there is nothing yet to ask about.
    if (session === undefined || this.#busy) return true;
    return session.mayLeave(this.#launchPage.window ?? session.window, "quit");
  }

  /** False when the person chose to stay (Cancel on either question). */
  async #leave(): Promise<boolean> {
    const session = this.#session;
    if (session === undefined) return true;
    // The questions belong to the window in front.
    const over = this.#launchPage.window ?? session.window;
    if (!(await session.mayLeave(over, "switch"))) return false;
    this.#session = undefined;
    // The launch page outlives the Studio window it was opened over.
    this.#launchPage.window?.setParentWindow(null);
    // Studio, the Output pages opened from it and the Display windows.
    // `destroy` skips the question `close` would ask again.
    for (const window of BrowserWindow.getAllWindows())
      if (window !== this.#launchPage.window) window.destroy();
    await session.end();
    this.#options.runtimes.setLocalPort(undefined);
    this.#menu.setStudio(undefined);
    return true;
  }

  async #switchToLocal(file: string): Promise<void> {
    this.#busy = true;
    await this.#leave().finally(() => {
      this.#busy = false;
    });
    await this.#runLocal(file);
  }

  #showLaunchPage(problem: string | null): void {
    this.#launchPage.show({
      problem,
      parent: this.#session?.window,
      onOpen: (window) => this.#menu.setLaunchWindow(window),
      onClosed: () => {
        this.#menu.setLaunchWindow(undefined);
        // Closed by the person with nothing chosen: that is quitting.
        if (this.#session === undefined && !this.#busy) app.quit();
      },
    });
  }
}
