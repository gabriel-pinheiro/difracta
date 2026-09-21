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

/** The words of the warning shown before a runtime with Output Sessions is stopped. */
export function outputsWarning(
  count: number,
  leaving: Leaving,
): {
  readonly message: string;
  readonly detail: string;
  readonly confirm: string;
} {
  const showing =
    count === 1
      ? "1 Output is showing from this computer."
      : `${String(count)} Outputs are showing from this computer.`;
  const them = count === 1 ? "it" : "them";
  return {
    message: showing,
    detail:
      leaving === "quit"
        ? `Quitting stops ${them}.`
        : `Switching stops ${them}.`,
    confirm: leaving === "quit" ? "Quit" : "Switch",
  };
}
