/** What a person answered to "Save the changes?"; `clean` when there was nothing to ask. */
export type UnsavedAnswer = "clean" | "save" | "discard" | "cancel";

export interface LeaveChecks {
  /** Whether leaving stops a runtime on this computer. One elsewhere keeps running, so nothing is asked. */
  readonly local: boolean;
  /**
   * Whether a window of Desktop is open. Without one nobody is there to
   * answer (started with `--no-studio` and stopped by a signal or the end of
   * the OS session), and a question would hang the stop.
   */
  readonly attended: boolean;
  /** Whether main's link to the runtime is up. A runtime that is gone has nothing to save and nothing to stop. */
  readonly connected: boolean;
  /** How many Output Sessions are attached. */
  readonly outputSessions: () => Promise<number>;
  readonly askUnsaved: () => Promise<UnsavedAnswer>;
  /** False when the save did not happen: the Save dialog was cancelled, or it failed. */
  readonly save: () => Promise<boolean>;
  /** The warning that Outputs go dark; false is Cancel. */
  readonly warnOutputs: (count: number) => Promise<boolean>;
  /** Closes the document without saving, autosave included. False when that failed. */
  readonly discard: () => Promise<boolean>;
}

/**
 * Whether a session may be left, asked the same way by quitting, by closing
 * the Studio window and by a target chosen under File ▸ Connect to...
 *
 *   unsaved changes?  Save / Don't Save / Cancel
 *   Outputs showing?  Quit (or Switch) / Cancel
 *
 * Cancel on either keeps everything as it was, which is why the order of the
 * acts differs from the order of the questions. Output Sessions are counted
 * first, while the document they belong to is still open. Save is done as
 * soon as it is chosen, since a saved file costs nothing if the person then
 * stays. Don't Save throws work away, so it waits until the second question
 * is answered too.
 */
export async function mayLeave(checks: LeaveChecks): Promise<boolean> {
  if (!checks.local || !checks.attended || !checks.connected) return true;
  const count = await checks.outputSessions();
  const unsaved = await checks.askUnsaved();
  if (unsaved === "cancel") return false;
  if (unsaved === "save" && !(await checks.save())) return false;
  if (count > 0 && !(await checks.warnOutputs(count))) return false;
  if (unsaved === "discard") return checks.discard();
  return true;
}
