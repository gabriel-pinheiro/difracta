import { dialog, type BrowserWindow } from "electron";
import path from "node:path";

/**
 * A file arrived from the OS (a double click, a second launch) while Desktop
 * shows a runtime elsewhere. A file on this disk can only open in a runtime on
 * this computer, which means leaving the other one, so that is asked rather
 * than done. False keeps the remote session.
 */
export async function mayLeaveRemoteFor(
  window: BrowserWindow,
  file: string,
  where: string,
): Promise<boolean> {
  const { response } = await dialog.showMessageBox(window, {
    type: "question",
    message: `Open “${path.basename(file)}” on this computer?`,
    detail: `Difracta is connected to ${where}. A file opens in a Runtime on this computer, which means leaving that one. It keeps running.`,
    buttons: ["Switch and Open", "Cancel"],
    defaultId: 0,
    cancelId: 1,
  });
  return response === 0;
}
