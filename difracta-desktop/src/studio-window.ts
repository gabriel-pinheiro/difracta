import { settings } from "@difracta/core";
import { BrowserWindow, shell, type WebContents } from "electron";

import { BRIDGE_ORIGIN_ARGUMENT, channels } from "./bridge-contract.ts";
import { linkTarget, isFromOrigin } from "./local-origin.ts";
import type { RuntimeLink } from "./runtime-link.ts";
import { windowTitle, type TitleWhere } from "./window-title.ts";

/**
 * What every page in Desktop runs with, spelled out although these are
 * Electron's defaults: the page is an ordinary web page. It has no Node
 * (`nodeIntegration`), its renderer process is sandboxed by the OS
 * (`sandbox`), and the preload script lives in a JavaScript world of its own
 * (`contextIsolation`), so a page cannot reach into it.
 */
export const pageSecurity = {
  nodeIntegration: false,
  sandbox: true,
  contextIsolation: true,
} as const;

/** Matches Studio's dark background, so a window does not flash white while loading. */
export const BACKGROUND = "#0a0a0a";

/**
 * Keeps a window on the runtime's pages. Following a link elsewhere would
 * turn the app window into a browser without an address bar; links meant for
 * a new window are sorted by `linkTarget`.
 */
function confine(contents: WebContents, origin: string): void {
  contents.on("will-navigate", (event, url) => {
    if (!isFromOrigin(url, origin)) event.preventDefault();
  });
  contents.setWindowOpenHandler(({ url }) => {
    const target = linkTarget(url, origin);
    if (target === "window") openPageWindow(url, origin);
    else if (target === "browser") void shell.openExternal(url);
    // Always denied: Electron would otherwise make a window with the opener's
    // preload. The ones wanted are made here, on Desktop's terms.
    return { action: "deny" };
  });
}

/**
 * A plain window for one of the runtime's other pages, which is how an Output
 * page opened from Studio shows. No preload, so no bridge; and no background
 * throttling, because an Output must keep its frame rate while it sits behind
 * other windows or on a projector nobody clicks on.
 *
 * No menu either (`removeMenu`; on macOS the one menu belongs to the app, and
 * its items leave this window alone, see `native-menu.ts`). With the bar go
 * its shortcuts, so no key zooms, reloads or opens developer tools on a
 * projector. F11 is the one key kept, handled here because the menu that had
 * it is gone: a window that cannot go full screen is no use on a projector.
 */
function openPageWindow(url: string, origin: string): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 720,
    backgroundColor: "#000000",
    webPreferences: { ...pageSecurity, backgroundThrottling: false },
  });
  window.removeMenu();
  window.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || input.key !== "F11") return;
    event.preventDefault();
    window.setFullScreen(!window.isFullScreen());
  });
  confine(window.webContents, origin);
  void window.loadURL(url);
}

export interface StudioWindowOptions {
  /** The runtime's origin; Studio is its `/studio/`. */
  readonly origin: string;
  /**
   * The preload script: `preload.cjs` for the runtime on this computer (the
   * native menu and the document bridge), `menu-preload.cjs` for one
   * elsewhere (the native menu only).
   */
  readonly preload: string;
  /** Asked before the window closes; false keeps it open. */
  readonly mayClose: (window: BrowserWindow) => Promise<boolean>;
}

/**
 * The window showing Studio, loaded from the runtime's own URL like any
 * browser tab would. Only this window gets a Studio preload, and the preload
 * is told the one origin it may hand its bridges to.
 */
export function createStudioWindow(
  options: StudioWindowOptions,
): BrowserWindow {
  const window = new BrowserWindow({
    width: settings.desktop.windowWidth,
    height: settings.desktop.windowHeight,
    title: "Difracta",
    backgroundColor: BACKGROUND,
    // The native menu bar is Studio's menu in Desktop (the page draws none,
    // see `application-menu.ts`), so it is always there, not behind Alt as
    // Electron can have it on Windows and Linux.
    autoHideMenuBar: false,
    webPreferences: {
      ...pageSecurity,
      preload: options.preload,
      additionalArguments: [`${BRIDGE_ORIGIN_ARGUMENT}${options.origin}`],
    },
  });
  confine(window.webContents, options.origin);

  // "close" can be cancelled, and the answer needs a dialog, so the first
  // attempt is always cancelled and repeated once the answer is yes.
  let asking = false;
  let confirmed = false;
  window.on("close", (event) => {
    if (confirmed) return;
    event.preventDefault();
    if (asking) return;
    asking = true;
    void options
      .mayClose(window)
      .then((yes) => {
        confirmed = yes;
        if (yes) window.close();
      })
      .finally(() => {
        asking = false;
      });
  });

  void window.loadURL(`${options.origin}/studio/`);
  return window;
}

/**
 * Writes the window's title from main's own link to the runtime, now and on
 * every change of the document summary. The page's own title is refused
 * (`page-title-updated`): only main knows where Studio comes from, and a page
 * from another machine does not get to name the window.
 */
export function followTitle(
  window: BrowserWindow,
  link: RuntimeLink,
  where: TitleWhere,
): void {
  window.on("page-title-updated", (event) => event.preventDefault());
  link.onDocumentChange((summary) => {
    if (!window.isDestroyed()) window.setTitle(windowTitle(summary, where));
  });
}

/** Hands Studio a file to open, once its page is there to hear it. */
export function requestOpen(window: BrowserWindow, file: string): void {
  const send = (): void => window.webContents.send(channels.openRequest, file);
  if (window.webContents.isLoading())
    window.webContents.once("did-finish-load", send);
  else send();
  if (window.isMinimized()) window.restore();
  window.focus();
}
