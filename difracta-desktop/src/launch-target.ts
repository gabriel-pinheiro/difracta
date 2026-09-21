import type { LaunchCurrent, LaunchResult } from "./launch-contract.ts";
import { addressLabel } from "./runtime-address.ts";
import { checkRuntime } from "./runtime-health.ts";
import type { RuntimeProcess } from "./runtime-process.ts";
import type { Session } from "./session.ts";

/** What a person chose on the launch page. */
export type LaunchTarget =
  | { readonly kind: "local" }
  | {
      readonly kind: "remote";
      readonly origin: string;
      readonly name: string | null;
    };

/** Whether `target` is the runtime `session` is already with. */
export function isCurrentTarget(
  session: Session,
  target: LaunchTarget,
): boolean {
  return target.kind === "local"
    ? session.bridgeOrigin !== undefined
    : session.origin === target.origin;
}

/** Whether `target` can be used, found out before a session is given up for it: the port being free for this computer, `/health` for a runtime elsewhere. */
export function checkTarget(
  target: LaunchTarget,
  runtime: RuntimeProcess,
): Promise<LaunchResult> {
  return target.kind === "local"
    ? runtime.checkPort()
    : checkRuntime(target.origin);
}

/** The runtime in use, as the launch page marks it when it is open over a session. */
export function launchCurrent(
  session: Session | undefined,
): LaunchCurrent | null {
  if (session === undefined) return null;
  return session.bridgeOrigin === undefined
    ? { kind: "remote", address: addressLabel(session.origin) }
    : { kind: "local" };
}
