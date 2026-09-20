import type { LaunchRemembered, LaunchRuntime } from "./launch-bridge";

/** One line of "Connect to a Runtime". */
export interface RuntimeRow {
  /** What `connect` and `forget` take. */
  readonly address: string;
  readonly title: string;
  /** Present when the runtime is on the network right now. */
  readonly found: LaunchRuntime | undefined;
  /** Connected to before; only such a row can be forgotten. */
  readonly remembered: boolean;
  /** The runtime Desktop is showing right now, which is marked, not offered. */
  readonly current: boolean;
}

/**
 * The runtimes on the network first, as announced, then the remembered ones
 * that are not. A remembered runtime is the same as a found one when the
 * address matches, or the announced name does: the name survives the router
 * handing the machine another address, and then the found address is the one
 * to connect to.
 */
export function runtimeRows(
  runtimes: readonly LaunchRuntime[],
  remembered: readonly LaunchRemembered[],
  /** The address of the runtime in use, if it is one elsewhere. */
  current?: string,
): RuntimeRow[] {
  const isFound = (known: LaunchRemembered): boolean =>
    runtimes.some(
      (runtime) =>
        runtime.address === known.address ||
        (known.name !== null && runtime.name === known.name),
    );
  return [
    ...runtimes.map((runtime) => ({
      address: runtime.address,
      title: runtime.name,
      found: runtime,
      remembered: remembered.some(
        (known) =>
          known.address === runtime.address || known.name === runtime.name,
      ),
      current: runtime.address === current,
    })),
    ...remembered
      .filter((known) => !isFound(known))
      .map((known) => ({
        address: known.address,
        title: known.name ?? known.address,
        found: undefined,
        remembered: true,
        current: known.address === current,
      })),
  ];
}
