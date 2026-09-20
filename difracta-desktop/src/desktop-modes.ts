import { settings } from "@difracta/core";
import { app, BrowserWindow } from "electron";
import path from "node:path";

import { ApplicationMenu } from "./application-menu.ts";
import { switchSession } from "./connect-to.ts";
import type { DesktopStateStore } from "./desktop-state.ts";
import { registerFileDialogs } from "./file-dialogs.ts";
import { mayLeaveRemoteFor } from "./file-from-os-prompt.ts";
import type { LaunchCurrent, LaunchResult } from "./launch-contract.ts";
import { LaunchPage } from "./launch-page.ts";
import type { LaunchRuntimes } from "./launch-runtimes.ts";
import { startLocalSession } from "./local-session.ts";
import { rememberRuntime } from "./remembered-runtimes.ts";
import { startRemoteSession } from "./remote-session.ts";
import { addressLabel, parseRuntimeAddress } from "./runtime-address.ts";
import { checkRuntime } from "./runtime-health.ts";
import type { RuntimeProcess } from "./runtime-process.ts";
import type { Session, SessionStart } from "./session.ts";
import type { StartUpMode } from "./start-up-mode.ts";
import { requestOpen } from "./studio-window.ts";

export interface DesktopModesOptions {
  readonly distDir: string;
  readonly runtime: RuntimeProcess;
  readonly state: DesktopStateStore;
  readonly runtimes: LaunchRuntimes;
}

/** What a person chose on the launch page. */
type Target =
  | { readonly kind: "local" }
  | {
      readonly kind: "remote";
      readonly origin: string;
      readonly name: string | null;
    };

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
 */
export class DesktopModes {
  readonly #options: DesktopModesOptions;
  readonly #menu: ApplicationMenu;
  readonly #launchPage: LaunchPage;
  #session: Session | undefined;
  /** A session is starting or being left; whatever else is asked waits or is refused. */
  #busy = false;
  /** A file the OS asked for while busy. */
  #pendingFile: string | undefined;

  constructor(options: DesktopModesOptions) {
    this.#options = options;
    registerFileDialogs({
      origin: () => this.#session?.bridgeOrigin,
      window: () => this.#session?.window,
      currentFile: () => this.#session?.currentFile(),
    });
    this.#launchPage = new LaunchPage(options, {
      current: () => this.#current(),
      runLocal: () => this.#choose({ kind: "local" }),
      connect: (address) => this.#connect(address),
    });
    this.#menu = new ApplicationMenu({
      runtimeLog: options.runtime.logFile,
      onConnectTo: () => this.connectTo(),
    });
  }

  async startUp(mode: StartUpMode): Promise<void> {
    if (mode.kind === "launch-page") this.#showLaunchPage(null);
    else if (mode.kind === "local") await this.#runLocal(mode.file);
    else if (mode.kind === "remote") await this.#enter(this.#remote(mode));
    else await this.#runLocal(mode.file, mode.url);
  }

  /** A file the OS wants open: always on this computer. */
  openFromOs(file: string): void {
    const session = this.#session;
    if (this.#busy) this.#pendingFile = file;
    else if (session === undefined) void this.#runLocal(file);
    else if (session.bridgeOrigin !== undefined)
      // Studio's own Open, unsaved-changes question included.
      requestOpen(session.window, file);
    else void this.#leaveRemoteFor(file, session);
  }

  focus(): void {
    // The launch page, when open, is in front of Studio.
    const window = this.#launchPage.window ?? this.#session?.window;
    if (window === undefined) return;
    if (window.isMinimized()) window.restore();
    window.focus();
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
    studioUrl?: string,
  ): Promise<LaunchResult> {
    const { runtime, state, runtimes, distDir } = this.#options;
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
    return () => startRemoteSession({ ...target, preload });
  }

  #current(): LaunchCurrent | null {
    const session = this.#session;
    if (session === undefined) return null;
    return session.bridgeOrigin === undefined
      ? { kind: "remote", address: addressLabel(session.origin) }
      : { kind: "local" };
  }

  /**
   * A choice on the launch page. With no session it simply starts. Over a
   * session it is a switch: checked first, then the session is left, its
   * question asked, then the new one starts. Choosing what is in use, or
   * cancelling that question, closes the launch page and changes nothing.
   */
  async #choose(target: Target): Promise<LaunchResult> {
    const start = (): Promise<LaunchResult> =>
      target.kind === "local"
        ? this.#runLocal(undefined)
        : this.#enter(this.#remote(target));
    const session = this.#session;
    if (session === undefined) return start();
    if (this.#busy) return { ok: false, reason: BUSY };

    this.#busy = true;
    const outcome = await switchSession({
      isCurrent:
        target.kind === "local"
          ? session.bridgeOrigin !== undefined
          : session.origin === target.origin,
      check: () =>
        target.kind === "local"
          ? this.#options.runtime.checkPort()
          : checkRuntime(target.origin),
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
    this.#openPendingFile();
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

    this.#openPendingFile();
    return result;
  }

  /** A file the OS asked for while Desktop was busy gets its turn. */
  #openPendingFile(): void {
    const file = this.#pendingFile;
    this.#pendingFile = undefined;
    if (file !== undefined) this.openFromOs(file);
  }

  #adopt(session: Session): void {
    this.#session = session;
    // Without its Studio window Desktop has nothing to show for itself, so
    // closing Studio quits, on macOS too. Switching ends the session first.
    session.window.on("closed", () => {
      if (this.#session === session) app.quit();
    });
    this.#menu.setStudio({
      window: session.window,
      origin: session.origin,
      local: session.bridgeOrigin !== undefined,
    });
    this.#launchPage.close();

    const { resume } = session;
    if (resume !== undefined)
      void this.#options.state.update((state) => ({
        ...state,
        lastMode: resume,
        remembered:
          resume.kind === "remote"
            ? rememberRuntime(
                state.remembered,
                { origin: resume.origin, name: resume.name },
                settings.desktop.rememberedRuntimesLimit,
              )
            : state.remembered,
      }));
  }

  /** False when the person chose to stay (Cancel on unsaved changes). */
  async #leave(): Promise<boolean> {
    const session = this.#session;
    if (session === undefined) return true;
    // The question belongs to the window in front.
    if (!(await session.mayLeave(this.#launchPage.window ?? session.window)))
      return false;
    this.#session = undefined;
    // The launch page outlives the Studio window it was opened over.
    this.#launchPage.window?.setParentWindow(null);
    // Studio, and the Output pages opened from it. `destroy` skips the
    // question `close` would ask again.
    for (const window of BrowserWindow.getAllWindows())
      if (window !== this.#launchPage.window) window.destroy();
    await session.end();
    this.#options.runtimes.setLocalPort(undefined);
    this.#menu.setStudio(undefined);
    return true;
  }

  async #leaveRemoteFor(file: string, session: Session): Promise<void> {
    this.focus();
    const yes = await mayLeaveRemoteFor(session.window, file, session.where);
    if (!yes || this.#session !== session || this.#busy) return;
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
