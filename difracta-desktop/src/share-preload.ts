/**
 * The share window's preload script, separate from Studio's and the launch
 * page's: each window gets one preload, and each preload hands out one
 * bridge. This one is given to the share window only, and checks the page's
 * address as well, so a page that somehow ended up in that window gets
 * nothing.
 */
import { contextBridge, ipcRenderer } from "electron";

import { isSharePage } from "./launch-scheme.ts";
import {
  shareChannels,
  type DifractaShare,
  type ShareContext,
  type ShareSourceChoice,
} from "./share-contract.ts";

if (isSharePage(location.href)) {
  const bridge: DifractaShare = {
    context: () =>
      ipcRenderer.invoke(shareChannels.context) as Promise<ShareContext>,
    sources: (kind) =>
      ipcRenderer.invoke(shareChannels.sources, kind) as Promise<
        ShareSourceChoice[]
      >,
    choose: (id) =>
      ipcRenderer.invoke(shareChannels.choose, id) as Promise<boolean>,
    report: (sharing) => ipcRenderer.send(shareChannels.report, sharing),
    onStopAll: (callback) => {
      const listener = (): void => callback();
      ipcRenderer.on(shareChannels.stopAll, listener);
      return () => ipcRenderer.off(shareChannels.stopAll, listener);
    },
  };
  contextBridge.exposeInMainWorld("difractaShare", bridge);
}
