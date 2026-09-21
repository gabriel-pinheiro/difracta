import { app, dialog } from "electron";
import { homedir } from "node:os";

import type { DesktopStateStore } from "./desktop-state.ts";
import {
  autostartCommand,
  autostartDirectory,
  XdgAutostart,
} from "./xdg-autostart.ts";

/** The two checkboxes under File ▸ Startup, as the menu shows them. */
export interface StartupChoices {
  readonly startAtLogin: boolean;
  readonly startWithoutStudio: boolean;
}

const NO_STUDIO_ARGUMENTS = ["--no-studio"];

/**
 * How the next start goes: whether the OS starts Desktop at login, and
 * whether local mode starts without its Studio window. Together they make a
 * venue's mini-PC an appliance: power on, and the runtime is up and showing.
 *
 * "Without the Studio window" is Desktop's own, kept in its state file.
 * "At login" is the operating system's, and the OS is asked rather than a
 * copy kept, so the checkbox is right after someone removed the entry with
 * the OS's own tools. macOS and Windows have Electron's login items; Linux
 * has none there, so it gets an XDG autostart file (`xdg-autostart.ts`). The
 * login entry says `--no-studio` when that setting is on, so it is written
 * again when either changes.
 */
export class StartupSettings {
  readonly #state: DesktopStateStore;
  readonly #autostart = new XdgAutostart(
    autostartDirectory(process.env, homedir()),
  );
  #choices: StartupChoices = { startAtLogin: false, startWithoutStudio: false };
  #listener: () => void = () => undefined;

  constructor(state: DesktopStateStore) {
    this.#state = state;
    void this.#refresh();
  }

  /** What is known now; `onChange` tells when it is something else. */
  get choices(): StartupChoices {
    return this.#choices;
  }

  onChange(listener: () => void): void {
    this.#listener = listener;
  }

  async setStartAtLogin(on: boolean): Promise<void> {
    await this.#register(on, this.#choices.startWithoutStudio).catch(
      (error: unknown) => {
        dialog.showErrorBox(
          "Could not change Start at Login",
          error instanceof Error ? error.message : String(error),
        );
      },
    );
    await this.#refresh();
  }

  async setStartWithoutStudio(on: boolean): Promise<void> {
    await this.#state.update((state) => ({
      ...state,
      startWithoutStudio: on,
    }));
    if (this.#choices.startAtLogin)
      await this.#register(true, on).catch(() => undefined);
    await this.#refresh();
    // No window and no tray icon: say how to get Studio back before it is needed.
    if (on)
      void dialog.showMessageBox({
        type: "info",
        message: "Difracta will start without its Studio window.",
        detail:
          "From the next start on, the Runtime on this computer runs with nothing on screen. To see Studio, start Difracta again while it is running.",
        buttons: ["OK"],
      });
  }

  async #register(on: boolean, noStudio: boolean): Promise<void> {
    if (process.platform !== "linux") {
      app.setLoginItemSettings({
        openAtLogin: on,
        // Windows only; macOS starts the app bare, and the stored setting applies.
        args: noStudio ? NO_STUDIO_ARGUMENTS : [],
      });
      return;
    }
    if (!on) return this.#autostart.disable();
    await this.#autostart.enable(
      autostartCommand({
        execPath: process.execPath,
        appPath: app.isPackaged ? undefined : app.getAppPath(),
        noSandbox: app.commandLine.hasSwitch("no-sandbox"),
        noStudio,
      }),
    );
  }

  async #registered(noStudio: boolean): Promise<boolean> {
    if (process.platform === "linux") return this.#autostart.enabled();
    // Windows tells login items apart by their arguments.
    return app.getLoginItemSettings({
      args: noStudio ? NO_STUDIO_ARGUMENTS : [],
    }).openAtLogin;
  }

  async #refresh(): Promise<void> {
    const startWithoutStudio =
      (await this.#state.read()).startWithoutStudio === true;
    this.#choices = {
      startWithoutStudio,
      startAtLogin: await this.#registered(startWithoutStudio),
    };
    this.#listener();
  }
}
