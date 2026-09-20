import { Autosave } from "./autosave.ts";
import {
  autosavePathFor,
  removeAutosaves,
  serializeDocument,
  writeFileAtomically,
} from "./document-file.ts";
import type { DocumentSession } from "./document-session.ts";

export interface SessionAutosaveOptions {
  readonly delayMs: number;
  readonly maxWaitMs: number;
  readonly log?: ((message: string) => void) | undefined;
}

/**
 * The sidecar clock of one open session: every change to its saved part
 * restarts the delay, and a session that starts dirty is due a write at once.
 * A session without a path, or a clean one, writes nothing. `stop` ends the
 * following; the caller settles or flushes the clock itself.
 */
export function followWithAutosave(
  session: DocumentSession,
  options: SessionAutosaveOptions,
): { readonly autosave: Autosave; readonly stop: () => void } {
  const autosave = new Autosave({
    delayMs: options.delayMs,
    maxWaitMs: options.maxWaitMs,
    write: async () => {
      if (!session.dirty || session.path === null) return false;
      try {
        const sidecar = autosavePathFor(session.path);
        await writeFileAtomically(sidecar, serializeDocument(session.document));
        await removeAutosaves(session.path, sidecar);
        return true;
      } catch (error) {
        options.log?.(
          `Autosave failed for ${session.path}: ${(error as Error).message}`,
        );
        return false;
      }
    },
  });
  const stop = session.onChange(() => autosave.changed());
  if (session.dirty) autosave.schedule();
  return { autosave, stop };
}
