import {
  leaveWarning,
  type Leaving,
  type LeaveWarning,
} from "./output-sessions.ts";

/** The most shares a page can say it runs: far past what a person would start. */
const REPORT_LIMIT = 64;

/**
 * How many shares the share window's page runs, from what it said: a count
 * crosses a process boundary, so anything that is not a whole number from
 * zero up counts as none.
 */
export function reportedShares(said: unknown): number {
  return typeof said === "number" && Number.isInteger(said) && said > 0
    ? Math.min(said, REPORT_LIMIT)
    : 0;
}

/**
 * The words of the warning shown before Desktop quits, or leaves its
 * runtime for another, while this computer shares: the Surfaces showing
 * its screen go blank.
 */
export function sharesWarning(count: number, leaving: Leaving): LeaveWarning {
  return leaveWarning(
    count === 1
      ? "This computer is sharing its screen into 1 Screen Share."
      : `This computer is sharing its screen into ${String(count)} Screen Shares.`,
    count,
    leaving,
  );
}
