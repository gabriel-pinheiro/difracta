import { ipcMain, type BrowserWindow } from "electron";

import { isFromOrigin } from "./local-origin.ts";
import { parsePageMenu, type PageMenu } from "./page-menu.ts";
import { menuChannels } from "./menu-contract.ts";

/** The Studio window of the session, and the origin its pages come from. */
export interface MenuWindow {
  readonly window: BrowserWindow;
  readonly origin: string;
}

/**
 * The main side of `setMenu`, registered once. A message proves only that
 * some frame sent it, so it has to come from the Studio window's own page, at
 * the session's origin; then what it carries is checked (`parsePageMenu`),
 * because that page may be served by another machine. Anything else is
 * dropped without an answer: `setMenu` has none to give.
 */
export function registerMenuBridge(options: {
  readonly studio: () => MenuWindow | undefined;
  readonly onMenu: (menu: PageMenu) => void;
}): void {
  ipcMain.on(menuChannels.setMenu, (event, model: unknown) => {
    const studio = options.studio();
    const trusted =
      studio?.window.webContents === event.sender &&
      isFromOrigin(event.senderFrame?.url, studio.origin);
    if (!trusted) return;
    const menu = parsePageMenu(model);
    if (menu !== undefined) options.onMenu(menu);
  });
}

/** Tells the page which of its items was chosen in the native menu. */
export function sendMenuCommand(window: BrowserWindow, id: string): void {
  if (!window.isDestroyed())
    window.webContents.send(menuChannels.menuCommand, id);
}

/**
 * What a Studio window's page is told, and what is forgotten with it.
 * `onPageGone` runs when the page is about to be another one (a reload, a
 * navigation): the menu it described went with it, and the next page
 * describes its own, or none if it is a Studio from before this bridge. Full
 * screen is said once a page has loaded and on every change.
 */
export function followMenuWindow(
  window: BrowserWindow,
  onPageGone: () => void,
): void {
  const { webContents } = window;
  webContents.on("did-start-navigation", (details) => {
    if (details.isMainFrame && !details.isSameDocument) onPageGone();
  });
  const sayFullScreen = (): void => {
    if (!window.isDestroyed())
      webContents.send(menuChannels.fullScreen, window.isFullScreen());
  };
  webContents.on("did-finish-load", sayFullScreen);
  window.on("enter-full-screen", sayFullScreen);
  window.on("leave-full-screen", sayFullScreen);
}
