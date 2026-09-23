import type { LiveState } from "@difracta/protocol";

/** Why a local session is being left, which the warning's wording follows. */
export type Leaving = "quit" | "switch";

/**
 * How many Output Sessions are attached to the runtime, from its live state:
 * every Output page showing an Output, in a browser on a TV as much as in a
 * window of this Desktop, since all of them go dark with the runtime. A stale
 * one has stopped reporting (a tab that died without closing its socket), so
 * nobody is watching it.
 */
export function countOutputSessions(live: LiveState): number {
  return Object.values(live.outputs)
    .flatMap((output) => Object.values(output.sessions))
    .filter((session) => !session.stale).length;
}

export interface LeaveWarning {
  readonly message: string;
  readonly detail: string;
  readonly confirm: string;
}

/**
 * The words of the warning shown before a runtime with Output Sessions is
 * stopped. The Display windows of this Desktop are among them: each is an
 * Output Session of that runtime.
 */
export function outputsWarning(count: number, leaving: Leaving): LeaveWarning {
  return warning(
    count === 1
      ? "1 Output is showing from this computer."
      : `${String(count)} Outputs are showing from this computer.`,
    count,
    leaving,
  );
}

/**
 * The words of the warning shown before a runtime elsewhere is left while
 * Displays of this computer show its Outputs: the runtime goes on, those
 * Displays go dark.
 */
export function displaysWarning(count: number, leaving: Leaving): LeaveWarning {
  return warning(
    count === 1
      ? "1 Display of this computer is showing an Output."
      : `${String(count)} Displays of this computer are showing Outputs.`,
    count,
    leaving,
  );
}

function warning(
  message: string,
  count: number,
  leaving: Leaving,
): LeaveWarning {
  const them = count === 1 ? "it" : "them";
  return {
    message,
    detail:
      leaving === "quit"
        ? `Quitting stops ${them}.`
        : `Switching stops ${them}.`,
    confirm: leaving === "quit" ? "Quit" : "Switch",
  };
}
