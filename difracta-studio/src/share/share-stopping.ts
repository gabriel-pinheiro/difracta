import type { Sharer } from "./sharer";

/** What the stopping needs of the Installation's reader. */
export interface SharedStill {
  stillShared(slots: readonly string[], sharer: string): boolean;
  onLive(listener: () => void): () => void;
}

/**
 * Stops every share, and resolves once the runtime's live state says none
 * of them is this computer's any more: Desktop closes the window next, and
 * a stop still on its way would reach the runtime as a connection that
 * dropped. Desktop waits only so long, so nothing here needs a limit.
 */
export function stopEverything(
  sharer: Pick<Sharer, "shares" | "stopAll">,
  installation: SharedStill,
  name: string,
): Promise<void> {
  const slots = sharer.shares.get().map((share) => share.mediaId);
  sharer.stopAll();
  return new Promise((resolve) => {
    if (!installation.stillShared(slots, name)) {
      resolve();
      return;
    }
    const unsubscribe = installation.onLive(() => {
      if (installation.stillShared(slots, name)) return;
      unsubscribe();
      resolve();
    });
  });
}
