import { settings } from "@difracta/core";
import { BrowserWindow, session, type Session } from "electron";

import { SHARE_PAGE_URL } from "./launch-scheme.ts";
import { BACKGROUND, pageSecurity } from "./studio-window.ts";

/**
 * The share window's pages run in a session of their own, kept in memory:
 * the answer to a request to capture the screen (`share-capture.ts`) is set
 * per session, and no other page of Desktop's, least of all one a runtime
 * serves, is ever in this one.
 */
export const shareSession = (): Session =>
  session.fromPartition("difracta-share");

/**
 * The share window: the page of Desktop's own that captures this computer's
 * screens and windows and sends them to the Viewers. It is the only window
 * with the share preload, it goes nowhere and opens nothing, and it has no
 * menu. It is never throttled: it goes on capturing and encoding while it
 * is hidden or behind other windows, which is where it spends a show.
 *
 * `mayClose` is asked when a person closes it; false hides it instead.
 */
export function createShareWindow(options: {
  readonly preload: string;
  readonly mayClose: () => boolean;
}): BrowserWindow {
  const window = new BrowserWindow({
    width: settings.desktop.shareWindowWidth,
    height: settings.desktop.shareWindowHeight,
    // Plain ASCII, as every title of Desktop's (`window-title.ts`).
    title: "Share Screen - Difracta",
    backgroundColor: BACKGROUND,
    webPreferences: {
      ...pageSecurity,
      preload: options.preload,
      session: shareSession(),
      backgroundThrottling: false,
    },
  });
  window.removeMenu();
  window.on("page-title-updated", (event) => event.preventDefault());
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.on("close", (event) => {
    if (options.mayClose()) return;
    event.preventDefault();
    window.hide();
  });
  void window.loadURL(SHARE_PAGE_URL);
  return window;
}
