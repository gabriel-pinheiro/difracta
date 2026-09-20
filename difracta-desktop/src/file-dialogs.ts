import {
  app,
  dialog,
  ipcMain,
  type BrowserWindow,
  type IpcMainInvokeEvent,
} from "electron";
import path from "node:path";

import { channels } from "./bridge-contract.ts";
import { isFromOrigin } from "./local-origin.ts";

const filters = [{ name: "Difracta Installation", extensions: ["difracta"] }];

/** Dialogs start in the folder of the file in use, else the OS documents folder. */
function startingFolder(currentFile: string | undefined): string {
  return currentFile === undefined
    ? app.getPath("documents")
    : path.dirname(currentFile);
}

export async function pickOpenPath(
  window: BrowserWindow,
  currentFile: string | undefined,
): Promise<string | null> {
  const { canceled, filePaths } = await dialog.showOpenDialog(window, {
    title: "Open Installation",
    defaultPath: startingFolder(currentFile),
    filters,
    properties: ["openFile"],
  });
  return canceled ? null : (filePaths[0] ?? null);
}

export async function pickSavePath(
  window: BrowserWindow,
  currentFile: string | undefined,
  suggestedName: string | undefined,
): Promise<string | null> {
  // A name, never a path: separators would move the dialog somewhere else.
  const name = suggestedName?.replace(/[\\/:]/g, " ").trim();
  const folder = startingFolder(currentFile);
  const { canceled, filePath } = await dialog.showSaveDialog(window, {
    title: "Save Installation As",
    defaultPath:
      name === undefined || name === ""
        ? folder
        : path.join(folder, `${name}.difracta`),
    filters,
  });
  return canceled || filePath === "" ? null : filePath;
}

/**
 * The main side of the bridge's two pickers. `ipcMain.handle` answers the
 * preload's `ipcRenderer.invoke`, and a channel takes one handler for the
 * app's whole life, so this is registered once and asks what is current.
 * Every call is checked for where it came from: only a frame showing the
 * local runtime's pages is answered, and nobody is while there is none.
 */
export function registerFileDialogs(options: {
  /** The local runtime's origin; undefined while Desktop shows no local runtime. */
  readonly origin: () => string | undefined;
  readonly window: () => BrowserWindow | undefined;
  /** The open file, else the last one: where a dialog starts. */
  readonly currentFile: () => string | undefined;
}): void {
  const trusted = (event: IpcMainInvokeEvent): BrowserWindow | undefined => {
    const origin = options.origin();
    return origin !== undefined && isFromOrigin(event.senderFrame?.url, origin)
      ? options.window()
      : undefined;
  };

  ipcMain.handle(channels.pickOpenPath, (event) => {
    const window = trusted(event);
    return window === undefined
      ? null
      : pickOpenPath(window, options.currentFile());
  });
  ipcMain.handle(channels.pickSavePath, (event, suggestedName: unknown) => {
    const window = trusted(event);
    return window === undefined
      ? null
      : pickSavePath(
          window,
          options.currentFile(),
          typeof suggestedName === "string" ? suggestedName : undefined,
        );
  });
}
