import { settings } from "@difracta/core";
import { BrowserWindow, shell, type WebContents } from "electron";

import { BRIDGE_ORIGIN_ARGUMENT, channels } from "./bridge-contract.ts";
import { linkTarget, isFromOrigin } from "./local-origin.ts";

/**
 * What every page in Desktop runs with, spelled out although these are
 * Electron's defaults: the page is an ordinary web page. It has no Node
 * (`nodeIntegration`), its renderer process is sandboxed by the OS
 * (`sandbox`), and the preload script lives in a JavaScript world of its own
 * (`contextIsolation`), so a page cannot reach into it.
 */
const pageSecurity = {
  nodeIntegration: false,
  sandbox: true,
  contextIsolation: true,
} as const;

/** Matches Studio's dark background, so a window does not flash white while loading. */
const BACKGROUND = "#0a0a0a";

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
 */
function openPageWindow(url: string, origin: string): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 720,
    backgroundColor: "#000000",
    autoHideMenuBar: true,
    webPreferences: { ...pageSecurity, backgroundThrottling: false },
  });
  confine(window.webContents, origin);
  void window.loadURL(url);
}

export interface StudioWindowOptions {
  /** The local runtime's origin; Studio is its `/studio/`. */
  readonly origin: string;
  readonly preload: string;
  /** Asked before the window closes; false keeps it open. */
  readonly mayClose: (window: BrowserWindow) => Promise<boolean>;
}

/**
 * The window showing Studio, loaded from the runtime's own URL like any
 * browser tab would. Only this window gets the preload script, and the
 * preload is told the one origin it may hand the bridge to.
 */
export function createStudioWindow(
  options: StudioWindowOptions,
): BrowserWindow {
  const window = new BrowserWindow({
    width: settings.desktop.windowWidth,
    height: settings.desktop.windowHeight,
    title: "Difracta",
    backgroundColor: BACKGROUND,
    // Studio has its own menu bar; the native one shows while Alt is held
    // (Windows and Linux) and its shortcuts work either way.
    autoHideMenuBar: true,
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

/** Hands Studio a file to open, once its page is there to hear it. */
export function requestOpen(window: BrowserWindow, file: string): void {
  const send = (): void => window.webContents.send(channels.openRequest, file);
  if (window.webContents.isLoading())
    window.webContents.once("did-finish-load", send);
  else send();
  if (window.isMinimized()) window.restore();
  window.focus();
}
