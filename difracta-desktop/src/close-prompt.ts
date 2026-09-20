import { dialog, type BrowserWindow } from "electron";

import { pickSavePath } from "./file-dialogs.ts";
import type { RuntimeLink } from "./runtime-link.ts";

/**
 * Whether the Studio window may close. With unsaved changes it asks the
 * question every document app asks; Save on an Installation that has no file
 * yet goes through the Save dialog, and cancelling that cancels the close.
 * Don't Save closes the document in the runtime as discarded, so its autosave
 * does not come back as a recovery on the next launch.
 */
export async function mayClose(
  window: BrowserWindow,
  link: RuntimeLink,
): Promise<boolean> {
  const summary = link.document();
  if (summary?.dirty !== true) return true;

  const { response } = await dialog.showMessageBox(window, {
    type: "warning",
    message: `Save the changes to “${summary.name}”?`,
    detail: "Your changes are lost if you do not save them.",
    buttons: ["Save", "Don't Save", "Cancel"],
    defaultId: 0,
    cancelId: 2,
  });
  if (response === 2) return false;
  try {
    if (response === 1) {
      await link.discard(summary.id);
      return true;
    }
    if (summary.path !== null) {
      await link.save(summary.id);
      return true;
    }
    const path = await pickSavePath(window, undefined, summary.name);
    if (path === null) return false;
    await link.save(summary.id, path);
    return true;
  } catch (error) {
    dialog.showErrorBox(
      "Could not save",
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
}
