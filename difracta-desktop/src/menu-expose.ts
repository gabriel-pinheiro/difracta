import { contextBridge, ipcRenderer } from "electron";

import { BRIDGE_ORIGIN_ARGUMENT } from "./bridge-contract.ts";
import { menuChannels, type DifractaMenu } from "./menu-contract.ts";

/**
 * The preload side of `window.difractaMenu`, shared by both Studio preloads
 * (`preload.ts` for the runtime on this computer, `menu-preload.ts` for one
 * elsewhere). Returns the origin main named for this window when the page is
 * from there, which is the only page that gets anything.
 */
export function exposeMenu(): string | undefined {
  const origin = process.argv
    .find((argument) => argument.startsWith(BRIDGE_ORIGIN_ARGUMENT))
    ?.slice(BRIDGE_ORIGIN_ARGUMENT.length);
  if (origin === undefined || location.origin !== origin) return undefined;

  const commandListeners = new Set<(id: string) => void>();
  ipcRenderer.on(menuChannels.menuCommand, (_event, id: unknown) => {
    if (typeof id === "string")
      for (const listener of commandListeners) listener(id);
  });

  // Main says it once the page has loaded and on every change; the last
  // answer waits here for whoever subscribes later.
  let fullScreen = false;
  const fullScreenListeners = new Set<(fullScreen: boolean) => void>();
  ipcRenderer.on(menuChannels.fullScreen, (_event, value: unknown) => {
    fullScreen = value === true;
    for (const listener of fullScreenListeners) listener(fullScreen);
  });

  const bridge: DifractaMenu = {
    setMenu: (model) => ipcRenderer.send(menuChannels.setMenu, model),
    onMenuCommand: (callback) => {
      commandListeners.add(callback);
      return () => commandListeners.delete(callback);
    },
    onFullScreenChange: (callback) => {
      fullScreenListeners.add(callback);
      callback(fullScreen);
      return () => fullScreenListeners.delete(callback);
    },
  };
  contextBridge.exposeInMainWorld("difractaMenu", bridge);
  return origin;
}
