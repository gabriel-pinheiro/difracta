/**
 * Whether this Studio may name a folder on the runtime's disk: adding a
 * Pack from a folder and locating a missing one. It may inside Difracta
 * Desktop showing its own runtime (the bridge is there) and from a Studio
 * on the runtime's own machine when that runtime is free, the same places
 * `documents.open` is allowed. A remote Studio attaches Packs the runtime's
 * machine already knows and edits metadata instead.
 */
export const FOLDER_GATE_REASON =
  "Naming a folder reaches the runtime's disk, so it is only possible from Difracta Desktop or from a Studio on the runtime's own computer with a free runtime. From here, attach a Pack that computer already knows.";

/** Why naming a folder is refused here, or undefined when it is allowed. */
export function folderGate(
  desktop: boolean,
  free: boolean,
): string | undefined {
  return desktop || free ? undefined : FOLDER_GATE_REASON;
}
