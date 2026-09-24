import { BrowserWindow } from "electron";

import type { DisplayDescription } from "./display-mapping.ts";
import { isFromOrigin } from "./local-origin.ts";
import { pageSecurity } from "./studio-window.ts";

/** The Output page of `output`, as any browser would open it. */
export function outputPageUrl(origin: string, output: string): string {
  return `${origin}/output/?output=${encodeURIComponent(output)}`;
}

/**
 * A Display window: one Output covering one Display of this computer, which
 * is what a Display Host opens when asked to show. It is an ordinary Output
 * page, so an Output Session like any other, in a window made for a
 * projector: no frame, full screen on the Display's bounds, above every other
 * window, never throttled, black until the page draws, no cursor, no zoom, no
 * menu and no preload, so no bridge.
 *
 * It is shown without taking the keyboard, so that showing an Output does not
 * pull typing away from Studio. Esc is the one key it knows, and the way out
 * for a person in front of a Display that a window covers: click it, press
 * Esc, and `onEscape` stops showing as `displays.hide` would.
 */
export function openDisplayWindow(options: {
  readonly origin: string;
  readonly output: string;
  readonly display: DisplayDescription;
  readonly onEscape: () => void;
}): BrowserWindow {
  const { origin } = options;
  const window = new BrowserWindow({
    ...options.display.bounds,
    show: false,
    frame: false,
    fullscreen: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: "#000000",
    // A projector's page never zooms, whatever Studio's zoom is.
    webPreferences: {
      ...pageSecurity,
      backgroundThrottling: false,
      zoomMode: "disabled",
    },
  });
  window.removeMenu();
  // Above full-screen windows and the desktop's own panels too.
  window.setAlwaysOnTop(true, "screen-saver");

  const { webContents } = window;
  webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || input.key !== "Escape") return;
    event.preventDefault();
    options.onEscape();
  });
  // The Output page and nothing else, whatever it links to.
  webContents.on("will-navigate", (event, url) => {
    if (!isFromOrigin(url, origin)) event.preventDefault();
  });
  webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  // Per page, so said again for every page loaded here.
  webContents.on("dom-ready", () => {
    void webContents.insertCSS("* { cursor: none !important; }");
  });

  // A window closed while it loads rejects, which is nobody's error.
  void window
    .loadURL(outputPageUrl(origin, options.output))
    .catch(() => undefined);
  window.showInactive();
  return window;
}
