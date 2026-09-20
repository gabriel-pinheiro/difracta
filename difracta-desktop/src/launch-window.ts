import { settings } from "@difracta/core";
import { BrowserWindow, net, protocol } from "electron";
import { pathToFileURL } from "node:url";

import { launchSchemeFile } from "./launch-scheme-file.ts";
import { LAUNCH_PAGE_URL, LAUNCH_SCHEME } from "./launch-scheme.ts";
import { BACKGROUND, pageSecurity } from "./studio-window.ts";

/**
 * Tells Chromium, before the app is ready (it cannot be said later), that
 * `app:` is a scheme like `https:`: "standard" gives its pages an origin and
 * relative URLs, "secure" spares them mixed-content rules, and
 * `supportFetchAPI` lets module scripts and fonts load from it.
 */
export function registerLaunchScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: LAUNCH_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true },
    },
  ]);
}

/** Answers `app://` requests from the built Studio in `studioDist`; see `launchSchemeFile` for what is served. */
export function serveLaunchScheme(studioDist: string): void {
  protocol.handle(LAUNCH_SCHEME, (request) => {
    const file = launchSchemeFile(request.url, studioDist);
    return file === undefined
      ? new Response("Not found", { status: 404 })
      : net.fetch(pathToFileURL(file).toString());
  });
}

/**
 * The window showing the launch page. It is the only one with the launch
 * preload, and it goes nowhere: no navigation, no new windows.
 *
 * Opened from File ▸ Connect to... it has the Studio window as `parent`,
 * which keeps it in front of Studio without stopping Studio from being used:
 * the session goes on until something is chosen here. It is not `modal`,
 * which Linux window managers honour each in their own way.
 */
export function createLaunchWindow(
  preload: string,
  parent: BrowserWindow | undefined,
): BrowserWindow {
  const window = new BrowserWindow({
    width: settings.desktop.launchWindowWidth,
    height: settings.desktop.launchWindowHeight,
    title: "Difracta",
    backgroundColor: BACKGROUND,
    // Its own small menu (`native-menu.ts`), always shown like Studio's.
    autoHideMenuBar: false,
    ...(parent === undefined ? {} : { parent }),
    webPreferences: { ...pageSecurity, preload },
  });
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  void window.loadURL(LAUNCH_PAGE_URL);
  return window;
}
