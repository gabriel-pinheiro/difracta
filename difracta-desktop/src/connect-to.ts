import type { LaunchResult } from "./launch-contract.ts";

/** How a choice on the launch page ended while a session was running. */
export type SwitchOutcome =
  /** The choice was the runtime already in use: nothing to do. */
  | { readonly kind: "current" }
  /** The target cannot be used, found out before anything was left. The session goes on. */
  | { readonly kind: "refused"; readonly reason: string }
  /** The person cancelled the unsaved-changes question. The session goes on. */
  | { readonly kind: "stayed" }
  | { readonly kind: "started" }
  /** The old session is gone and the new one did not start: the launch page, alone, says why. */
  | { readonly kind: "failed"; readonly reason: string };

/**
 * File ▸ Connect to... opens the launch page over the running session, and
 * nothing is given up until a target is chosen. This is the order of what
 * happens then, kept apart from Electron so it can be tested.
 *
 * The target is checked before the session is left: leaving stops the runtime
 * on this computer, which turns every Output dark, and that must not be the
 * price of a mistyped address. `check` is `/health` for a runtime elsewhere
 * and "is the port free" for one on this computer; `start` does its own
 * checking again, for the first launch where nothing came before it.
 */
export async function switchSession(steps: {
  readonly isCurrent: boolean;
  readonly check: () => Promise<LaunchResult>;
  /** Asks about unsaved changes, then ends the session; false when the person stays. */
  readonly leave: () => Promise<boolean>;
  readonly start: () => Promise<LaunchResult>;
}): Promise<SwitchOutcome> {
  if (steps.isCurrent) return { kind: "current" };
  const checked = await steps.check();
  if (!checked.ok) return { kind: "refused", reason: checked.reason };
  if (!(await steps.leave())) return { kind: "stayed" };
  const started = await steps.start();
  return started.ok
    ? { kind: "started" }
    : { kind: "failed", reason: started.reason };
}
