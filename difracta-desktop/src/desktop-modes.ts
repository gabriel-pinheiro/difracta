import { settings } from "@difracta/core";
import { app, BrowserWindow } from "electron";
import path from "node:path";

import { installApplicationMenu } from "./application-menu.ts";
import type { DesktopStateStore } from "./desktop-state.ts";
import { registerFileDialogs } from "./file-dialogs.ts";
import { mayLeaveRemoteFor } from "./file-from-os-prompt.ts";
import { registerLaunchBridge } from "./launch-bridge.ts";
import {
  launchChannels,
  type LaunchRemembered,
  type LaunchResult,
} from "./launch-contract.ts";
import type { LaunchRuntimes } from "./launch-runtimes.ts";
import { createLaunchWindow } from "./launch-window.ts";
import { startLocalSession } from "./local-session.ts";
import { forgetRuntime, rememberRuntime } from "./remembered-runtimes.ts";
import { startRemoteSession } from "./remote-session.ts";
import { addressLabel, parseRuntimeAddress } from "./runtime-address.ts";
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

/**
 * Which of its three faces Desktop shows, and the way from one to the next:
 *
 *   launch page ── Run on this computer ──▶ local session ──┐
 *        ▲    └─── Connect to a Runtime ──▶ remote session ─┤
 *        └──────────── Runtime ▸ Switch… ◀──────────────────┘
 *
 * There is one session at most, and the launch page shows only while there is
 * none, so a runtime is never started while another is still stopping.
 */
export class DesktopModes {
  readonly #options: DesktopModesOptions;
  #session: Session | undefined;
  #launchWindow: BrowserWindow | undefined;
  /** A session is starting or being left; whatever else is asked waits or is refused. */
  #busy = false;
  /** Why the launch page shows instead of the mode that was to resume. */
  #problem: string | null = null;
  /** A file the OS asked for while busy. */
  #pendingFile: string | undefined;

  constructor(options: DesktopModesOptions) {
    this.#options = options;
    registerFileDialogs({
      origin: () => this.#session?.bridgeOrigin,
      window: () => this.#session?.window,
      currentFile: () => this.#session?.currentFile(),
    });
    registerLaunchBridge({
      problem: () => this.#problem,
      runLocal: () => this.#runLocal(undefined),
      connect: (address) => this.#connect(address),
      runtimes: () => options.runtimes.list(),
      remembered: async () =>
        this.#remembered((await options.state.read()).remembered),
      forget: (address) => this.#forget(address),
    });
    this.#installMenu();
  }

  async startUp(mode: StartUpMode): Promise<void> {
    if (mode.kind === "launch-page") this.#showLaunchPage(null);
    else if (mode.kind === "local") await this.#runLocal(mode.file);
    else if (mode.kind === "remote")
      await this.#enter(() => startRemoteSession(mode));
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
    const window = this.#session?.window ?? this.#launchWindow;
    if (window === undefined) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  }

  /** Runtime ▸ Switch…: leave the session, its question asked first, then the launch page. */
  async switchRuntime(): Promise<void> {
    if (this.#busy || this.#session === undefined) return;
    this.#busy = true;
    const left = await this.#leave().finally(() => {
      this.#busy = false;
    });
    if (left) this.#showLaunchPage(null);
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
    const { remembered } = await this.#options.state.read();
    const name =
      this.#options.runtimes.nameAt(origin) ??
      remembered.find((known) => known.origin === origin)?.name ??
      null;
    return this.#enter(() => startRemoteSession({ origin, name }));
  }

  /**
   * Starts a session unless one is there or on its way. A failure is the
   * launch page's to show: it gets the result when it asked, and is opened
   * with the reason when nobody was there to ask (a resume, a file).
   */
  async #enter(start: () => Promise<SessionStart>): Promise<LaunchResult> {
    if (this.#busy || this.#session !== undefined)
      return { ok: false, reason: "Difracta is already starting a Runtime." };
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
    if (!result.ok && this.#launchWindow === undefined)
      this.#showLaunchPage(result.reason);

    const file = this.#pendingFile;
    this.#pendingFile = undefined;
    if (file !== undefined) this.openFromOs(file);
    return result;
  }

  #adopt(session: Session): void {
    this.#session = session;
    this.#problem = null;
    // Without its Studio window Desktop has nothing to show for itself, so
    // closing Studio quits, on macOS too. Switching ends the session first.
    session.window.on("closed", () => {
      if (this.#session === session) app.quit();
    });
    this.#installMenu();
    this.#launchWindow?.close();

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
    if (!(await session.mayLeave())) return false;
    this.#session = undefined;
    // Studio, and the Output pages opened from it. `destroy` skips the
    // question `close` would ask again.
    for (const window of BrowserWindow.getAllWindows())
      if (window !== this.#launchWindow) window.destroy();
    await session.end();
    this.#options.runtimes.setLocalPort(undefined);
    this.#installMenu();
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
    this.#problem = problem;
    if (this.#launchWindow !== undefined) return;
    const { runtimes, distDir } = this.#options;
    const window = createLaunchWindow(path.join(distDir, "launch-preload.cjs"));
    this.#launchWindow = window;
    runtimes.open((list) => {
      if (!window.isDestroyed())
        window.webContents.send(launchChannels.runtimesChanged, list);
    });
    window.on("closed", () => {
      runtimes.close();
      this.#launchWindow = undefined;
      // Closed by the person with nothing chosen: that is quitting.
      if (this.#session === undefined && !this.#busy) app.quit();
    });
  }

  #remembered(
    remembered: readonly { origin: string; name: string | null }[],
  ): LaunchRemembered[] {
    return remembered.map(({ origin, name }) => ({
      address: addressLabel(origin),
      name,
    }));
  }

  async #forget(address: string): Promise<LaunchRemembered[]> {
    const parsed = parseRuntimeAddress(address);
    const state = await this.#options.state.update((known) =>
      parsed.ok
        ? {
            ...known,
            remembered: forgetRuntime(known.remembered, parsed.origin),
          }
        : known,
    );
    return this.#remembered(state.remembered);
  }

  #installMenu(): void {
    installApplicationMenu({
      runtimeLog: this.#options.runtime.logFile,
      where: this.#session?.where,
      onSwitch: () => void this.switchRuntime(),
    });
  }
}
