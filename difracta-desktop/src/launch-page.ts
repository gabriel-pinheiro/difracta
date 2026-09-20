import type { BrowserWindow } from "electron";
import path from "node:path";

import type { DesktopStateStore } from "./desktop-state.ts";
import { registerLaunchBridge } from "./launch-bridge.ts";
import {
  launchChannels,
  type LaunchCurrent,
  type LaunchRemembered,
  type LaunchResult,
} from "./launch-contract.ts";
import type { LaunchRuntimes } from "./launch-runtimes.ts";
import { createLaunchWindow } from "./launch-window.ts";
import { forgetRuntime } from "./remembered-runtimes.ts";
import { addressLabel, parseRuntimeAddress } from "./runtime-address.ts";

/** What the page hands on to `desktop-modes.ts`, which decides where Desktop goes. */
export interface LaunchChoices {
  current(): LaunchCurrent | null;
  runLocal(): Promise<LaunchResult>;
  connect(address: string): Promise<LaunchResult>;
}

export interface LaunchPageOptions {
  readonly distDir: string;
  readonly state: DesktopStateStore;
  readonly runtimes: LaunchRuntimes;
}

/**
 * The launch page as main holds it: its one window, why it shows, and what it
 * lists (the runtimes on the network, browsed only while the window is open,
 * and the remembered ones). The choices made on it are not decided here.
 */
export class LaunchPage {
  readonly #options: LaunchPageOptions;
  #window: BrowserWindow | undefined;
  /** Why the page shows instead of the mode that was to resume. */
  #problem: string | null = null;

  constructor(options: LaunchPageOptions, choices: LaunchChoices) {
    this.#options = options;
    registerLaunchBridge({
      ...choices,
      problem: () => this.#problem,
      runtimes: () => options.runtimes.list(),
      remembered: async () =>
        this.#remembered((await options.state.read()).remembered),
      forget: (address) => this.#forget(address),
    });
  }

  get window(): BrowserWindow | undefined {
    return this.#window;
  }

  /**
   * Opens the window unless it is open. `parent` is the Studio window it is
   * opened over; `onOpen` and `onClosed` tell whoever else cares.
   */
  show(options: {
    readonly problem: string | null;
    readonly parent: BrowserWindow | undefined;
    readonly onOpen: (window: BrowserWindow) => void;
    readonly onClosed: () => void;
  }): void {
    this.#problem = options.problem;
    if (this.#window !== undefined) return;
    const { runtimes, distDir } = this.#options;
    const window = createLaunchWindow(
      path.join(distDir, "launch-preload.cjs"),
      options.parent,
    );
    this.#window = window;
    options.onOpen(window);
    runtimes.open((list) => {
      if (!window.isDestroyed())
        window.webContents.send(launchChannels.runtimesChanged, list);
    });
    window.on("closed", () => {
      runtimes.close();
      this.#window = undefined;
      options.onClosed();
    });
  }

  close(): void {
    this.#window?.close();
  }

  /** The name the runtime at `origin` announces now, else the one it was remembered with. */
  async knownName(origin: string): Promise<string | null> {
    const { remembered } = await this.#options.state.read();
    return (
      this.#options.runtimes.nameAt(origin) ??
      remembered.find((known) => known.origin === origin)?.name ??
      null
    );
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
}
