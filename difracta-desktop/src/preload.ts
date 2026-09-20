/**
 * The preload script: the one piece of Desktop that runs inside the Studio
 * window. It runs before the page, in a context of its own
 * (`contextIsolation`), without Node (`sandbox`), and hands the page a few
 * functions through `contextBridge`. The page never sees `ipcRenderer`: each
 * function sends one fixed message, so a page can ask for a file picker and
 * nothing else.
 *
 * A sandboxed preload cannot `import` other files at run time, so
 * `scripts/build.mjs` bundles this one into a single CommonJS file.
 */
import { contextBridge, ipcRenderer } from "electron";

import {
  BRIDGE_ORIGIN_ARGUMENT,
  channels,
  type DifractaDesktop,
} from "./bridge-contract.ts";

// Main names the origin of the runtime it started. Only a page from there gets
// the bridge: a path on this machine's disk means nothing to any other runtime.
const bridgeOrigin = process.argv
  .find((argument) => argument.startsWith(BRIDGE_ORIGIN_ARGUMENT))
  ?.slice(BRIDGE_ORIGIN_ARGUMENT.length);

if (bridgeOrigin !== undefined && location.origin === bridgeOrigin) {
  // Open requests that arrive before Studio subscribes wait here.
  const waiting: string[] = [];
  let listener: ((path: string) => void) | undefined;
  ipcRenderer.on(channels.openRequest, (_event, path: unknown) => {
    if (typeof path !== "string") return;
    if (listener === undefined) waiting.push(path);
    else listener(path);
  });

  const bridge: DifractaDesktop = {
    pickOpenPath: () =>
      ipcRenderer.invoke(channels.pickOpenPath) as Promise<string | null>,
    pickSavePath: (suggestedName) =>
      ipcRenderer.invoke(channels.pickSavePath, suggestedName) as Promise<
        string | null
      >,
    onOpenRequest: (callback) => {
      listener = callback;
      for (const path of waiting.splice(0)) callback(path);
      return () => {
        if (listener === callback) listener = undefined;
      };
    },
  };
  contextBridge.exposeInMainWorld("difractaDesktop", bridge);
}
