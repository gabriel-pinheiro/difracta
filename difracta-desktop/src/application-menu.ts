import { settings } from "@difracta/core";
import { BrowserWindow, Menu, shell, type BaseWindow } from "electron";

import { nativeMenuTemplate, type NativeMenuActions } from "./native-menu.ts";
import { emptyPageMenu, type PageMenu } from "./page-menu.ts";
import type { StartupSettings } from "./startup-settings.ts";
import {
  followMenuWindow,
  registerMenuBridge,
  sendMenuCommand,
  type MenuWindow,
} from "./menu-bridge.ts";

/** The session's Studio window, as far as the menu cares. */
export interface MenuStudio extends MenuWindow {
  /** Whether Studio comes from the runtime on this computer. */
  readonly local: boolean;
}

export interface ApplicationMenuOptions {
  readonly runtimeLog: string;
  readonly onConnectTo: () => void;
  /** File ▸ Startup's two checkboxes, and what changes them. */
  readonly startup: StartupSettings;
}

/**
 * Keeps the native menu bar in step with what Desktop shows. `native-menu.ts`
 * says what is in the menu; this file is the Electron around it: whose menu
 * each window gets, what the items do, and when to build it again.
 *
 * A native menu cannot be edited once set, so every change means a new one:
 * the page describing its items (`setMenu`, on every dirty flip), another
 * session, the Studio or the launch window coming or going, a checkbox of
 * File ▸ Startup. Changes arrive in bursts, so
 * the rebuild waits `settings.desktop.menuRebuildDelayMs` for the last.
 */
export class ApplicationMenu {
  readonly #options: ApplicationMenuOptions;
  #studio: MenuStudio | undefined;
  #launchWindow: BrowserWindow | undefined;
  #page: PageMenu = emptyPageMenu;
  #timer: NodeJS.Timeout | undefined;

  constructor(options: ApplicationMenuOptions) {
    this.#options = options;
    options.startup.onChange(() => this.#changed());
    registerMenuBridge({
      studio: () => this.#studio,
      onMenu: (menu) => {
        this.#page = menu;
        this.#changed();
      },
    });
    this.#apply();
  }

  /** Another session's Studio window, or none. What the last page described is forgotten. */
  setStudio(studio: MenuStudio | undefined): void {
    this.#studio = studio;
    this.#page = emptyPageMenu;
    if (studio !== undefined)
      followMenuWindow(studio.window, () => {
        if (this.#studio !== studio) return;
        this.#page = emptyPageMenu;
        this.#changed();
      });
    // At once: a window must never show the menu of the session before it.
    this.#apply();
  }

  setLaunchWindow(window: BrowserWindow | undefined): void {
    this.#launchWindow = window;
    this.#apply();
  }

  #changed(): void {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(
      () => this.#apply(),
      settings.desktop.menuRebuildDelayMs,
    );
  }

  /**
   * The application menu is the Studio window's while there is a session and
   * the launch window's otherwise. On macOS that one menu is the whole story.
   * On Windows and Linux each window carries its own bar, and
   * `setApplicationMenu` hands its menu to every window there is, so the
   * others are put right after it: the launch window opened over a session
   * gets its smaller menu, and an Output window gets none at all, which also
   * takes every menu shortcut away from it. A stray key on a projector's
   * window must do nothing.
   */
  #apply(): void {
    clearTimeout(this.#timer);
    const studio = this.#studio;
    const build = (kind: "studio" | "launch"): Menu =>
      Menu.buildFromTemplate(
        nativeMenuTemplate({
          platform: process.platform,
          kind,
          page: this.#page,
          local: studio?.local ?? false,
          startup: this.#options.startup.choices,
          actions: this.#actions,
        }),
      );
    Menu.setApplicationMenu(build(studio === undefined ? "launch" : "studio"));
    if (process.platform === "darwin" || studio === undefined) return;
    for (const window of BrowserWindow.getAllWindows())
      if (window === this.#launchWindow) window.setMenu(build("launch"));
      else if (window !== studio.window) window.removeMenu();
  }

  /** The focused window when it is one the View and Help items may act on: Studio or the launch page, never an Output. */
  #ownWindow(window: BaseWindow | undefined): BrowserWindow | undefined {
    return [this.#studio?.window, this.#launchWindow].find(
      (own) => own !== undefined && own === window && !own.isDestroyed(),
    );
  }

  readonly #actions: NativeMenuActions = {
    pageCommand: (id, byKey) => {
      const window = this.#studio?.window;
      if (window === undefined || window.isDestroyed()) return;
      if (!byKey) {
        sendMenuCommand(window, id);
        return;
      }
      // Only macOS gets here (see `pageItem`), with a key the page left
      // alone. Studio leaves Undo and Redo alone inside a text field, where
      // they belong to the typing, and macOS undoes typing through the menu.
      if (id === "undo") window.webContents.undo();
      else if (id === "redo") window.webContents.redo();
    },
    connectTo: () => this.#options.onConnectTo(),
    setStartAtLogin: (on) => void this.#options.startup.setStartAtLogin(on),
    setStartWithoutStudio: (on) =>
      void this.#options.startup.setStartWithoutStudio(on),
    zoom: (focused, change) => {
      const contents = this.#ownWindow(focused)?.webContents;
      if (contents === undefined) return;
      // Half a level is the step of Electron's own zoom roles.
      const step = change === "in" ? 0.5 : -0.5;
      contents.setZoomLevel(
        change === "reset" ? 0 : contents.getZoomLevel() + step,
      );
    },
    toggleDevTools: (focused) =>
      this.#ownWindow(focused)?.webContents.toggleDevTools(),
    reloadStudio: () => this.#studio?.window.webContents.reload(),
    showRuntimeLog: () => shell.showItemInFolder(this.#options.runtimeLog),
  };
}
