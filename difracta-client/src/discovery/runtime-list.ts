import {
  runtimeFrom,
  sortRuntimes,
  type BrowsedService,
  type DiscoveredRuntime,
} from "./discovered-runtime.ts";

/** What a Zeroconf browser reports while it keeps listening. */
export type RuntimeListEvent =
  | { readonly type: "up"; readonly service: BrowsedService }
  | { readonly type: "down"; readonly service: BrowsedService }
  /** A record of a known service changed: its TXT, or its host and port. */
  | { readonly type: "update"; readonly service: BrowsedService };

/**
 * The list of runtimes after one browser event. The instance name is the key:
 * Zeroconf keeps it unique on a network. A runtime that announces a new TXT
 * record leaves and comes back (see the runtime's `bonjour-announcer.ts`), so
 * "up" for a name already listed replaces it rather than listing it twice.
 */
export function runtimeListAfter(
  runtimes: readonly DiscoveredRuntime[],
  event: RuntimeListEvent,
): DiscoveredRuntime[] {
  const others = runtimes.filter(
    (runtime) => runtime.name !== event.service.name,
  );
  return event.type === "down"
    ? others
    : sortRuntimes([...others, runtimeFrom(event.service)]);
}
