/**
 * The launch page's preload script, separate from Studio's `preload.ts`: each
 * window gets one preload, and each preload hands out one bridge. This one is
 * given to the launch window only, and checks the page's address as well, so
 * a page that somehow ended up in that window gets nothing.
 */
import { contextBridge, ipcRenderer } from "electron";

import {
  launchChannels,
  type DifractaLaunch,
  type LaunchRemembered,
  type LaunchResult,
  type LaunchRuntime,
} from "./launch-contract.ts";
import { isLaunchPage } from "./launch-scheme.ts";

if (isLaunchPage(location.href)) {
  const bridge: DifractaLaunch = {
    problem: () =>
      ipcRenderer.invoke(launchChannels.problem) as Promise<string | null>,
    runLocal: () =>
      ipcRenderer.invoke(launchChannels.runLocal) as Promise<LaunchResult>,
    connect: (address) =>
      ipcRenderer.invoke(
        launchChannels.connect,
        address,
      ) as Promise<LaunchResult>,
    runtimes: () =>
      ipcRenderer.invoke(launchChannels.runtimes) as Promise<LaunchRuntime[]>,
    onRuntimesChanged: (callback) => {
      const listener = (_event: unknown, runtimes: LaunchRuntime[]): void =>
        callback(runtimes);
      ipcRenderer.on(launchChannels.runtimesChanged, listener);
      return () => ipcRenderer.off(launchChannels.runtimesChanged, listener);
    },
    remembered: () =>
      ipcRenderer.invoke(launchChannels.remembered) as Promise<
        LaunchRemembered[]
      >,
    forget: (address) =>
      ipcRenderer.invoke(launchChannels.forget, address) as Promise<
        LaunchRemembered[]
      >,
  };
  contextBridge.exposeInMainWorld("difractaLaunch", bridge);
}
