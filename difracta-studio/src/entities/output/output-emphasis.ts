import { orderedEntries, type Output, type Table } from "@difracta/core";

import { liveSessions, sessionList, type SessionTable } from "./output-live";

/** The live table under `["live", "outputs"]`: sessions per Output id. */
export type LiveOutputs = Readonly<
  Record<string, { readonly sessions?: SessionTable }>
>;

/**
 * The Output whose Open button draws the eye: the first in navigator order,
 * while no Output has a live Output Session. Stale sessions do not count.
 */
export function emphasizedOutput(
  outputs: Table<Output>,
  live: LiveOutputs | undefined,
): string | undefined {
  const anyLive = Object.values(live ?? {}).some(
    (entry) => liveSessions(sessionList(entry.sessions)).length > 0,
  );
  if (anyLive) return undefined;
  return orderedEntries(outputs)[0]?.id;
}
