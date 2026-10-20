import type { SnapshotReading } from "@difracta/client";

const MISMATCH =
  "The runtime is likely a different build of Difracta than this Desktop; updating one to match the other fixes it.";

/**
 * Why the window cannot show the Screen Shares, from what this client could
 * not read of the runtime's snapshot; null when it can. Other tables it
 * could not read do not concern it.
 */
export function readingProblem(
  reading: SnapshotReading | undefined,
): string | null {
  if (reading === undefined) return null;
  if (reading.failure !== undefined)
    return `This window could not read the runtime's Installation (${reading.failure}). ${MISMATCH}`;
  const shares = reading.unreadable.find(
    ({ part }) => part === "shares" || part === "live/shares",
  );
  return shares === undefined
    ? null
    : `This window could not read the Installation's Screen Shares (${shares.part}: ${shares.issue}). ${MISMATCH}`;
}
