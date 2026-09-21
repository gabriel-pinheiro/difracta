import { dialog, type BrowserWindow, type MessageBoxOptions } from "electron";

import { pickSavePath } from "./file-dialogs.ts";
import { mayLeave, type UnsavedAnswer } from "./leave-checks.ts";
import { outputsWarning, type Leaving } from "./output-sessions.ts";
import type { RuntimeLink } from "./runtime-link.ts";

/** A message box on `over` when there is such a window, else one of its own. */
async function ask(
  over: BrowserWindow | undefined,
  options: MessageBoxOptions,
): Promise<number> {
  const { response } = await (over === undefined || over.isDestroyed()
    ? dialog.showMessageBox(options)
    : dialog.showMessageBox(over, options));
  return response;
}

/** An act that may fail, with the failure shown rather than thrown; false when it did. */
async function shown(act: () => Promise<boolean>): Promise<boolean> {
  try {
    return await act();
  } catch (error) {
    dialog.showErrorBox(
      "Could not save",
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
}

/**
 * The native questions asked before the runtime on this computer is left,
 * in the order `leave-checks.ts` gives them. With unsaved changes, the
 * question every document app asks: Save on an Installation that has no file
 * yet goes through the Save dialog, and cancelling that cancels the leaving;
 * Don't Save closes the document in the runtime as discarded, so its autosave
 * does not come back as a recovery on the next launch. With Output Sessions
 * attached, a warning that they go dark. It only warns: a person who wants to
 * quit mid-show may.
 *
 * `over` is the window the questions belong to, none when Desktop has none
 * open, in which case `attended` is false and nothing is asked at all.
 */
export function mayLeaveLocal(options: {
  readonly link: RuntimeLink;
  readonly over: BrowserWindow | undefined;
  readonly leaving: Leaving;
  readonly attended: boolean;
}): Promise<boolean> {
  const { link, over, leaving } = options;
  // The document the questions are about, as it was when they began.
  const summary = link.document();
  return mayLeave({
    local: true,
    attended: options.attended,
    connected: link.connected(),
    outputSessions: () => link.outputSessions(),
    askUnsaved: async (): Promise<UnsavedAnswer> => {
      if (summary?.dirty !== true) return "clean";
      const response = await ask(over, {
        type: "warning",
        message: `Save the changes to “${summary.name}”?`,
        detail: "Your changes are lost if you do not save them.",
        buttons: ["Save", "Don't Save", "Cancel"],
        defaultId: 0,
        cancelId: 2,
      });
      return (["save", "discard", "cancel"] as const)[response] ?? "cancel";
    },
    save: () =>
      shown(async () => {
        if (summary === null) return true;
        if (summary.path !== null) {
          await link.save(summary.id);
          return true;
        }
        if (over === undefined) return false;
        const path = await pickSavePath(over, undefined, summary.name);
        if (path === null) return false;
        await link.save(summary.id, path);
        return true;
      }),
    warnOutputs: async (count) => {
      const { message, detail, confirm } = outputsWarning(count, leaving);
      const response = await ask(over, {
        type: "warning",
        message,
        detail,
        buttons: [confirm, "Cancel"],
        defaultId: 1,
        cancelId: 1,
      });
      return response === 0;
    },
    discard: () =>
      shown(async () => {
        if (summary !== null) await link.discard(summary.id);
        return true;
      }),
  });
}
