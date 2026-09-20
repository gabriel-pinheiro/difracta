import { settings } from "@difracta/core";
import { Bonjour } from "bonjour-service";

import {
  runtimeFrom,
  sortRuntimes,
  type DiscoveredRuntime,
} from "./discovered-runtime.ts";
import { runtimeListAfter, type RuntimeListEvent } from "./runtime-list.ts";

const query = {
  type: settings.discovery.serviceType,
  protocol: "tcp",
} as const;

/**
 * Browses `_difracta._tcp` for `listenMs` and returns whoever answered, this
 * machine's runtimes included, sorted by name.
 */
export async function browseRuntimes(
  listenMs: number = settings.discovery.browseMs,
): Promise<DiscoveredRuntime[]> {
  const bonjour = new Bonjour({}, () => undefined);
  const browser = bonjour.find(query);
  await new Promise((resolve) => setTimeout(resolve, listenMs));
  const runtimes = browser.services.map((service) => runtimeFrom(service));
  browser.stop();
  await new Promise<void>((resolve) => {
    bonjour.destroy(() => resolve());
  });
  return sortRuntimes(runtimes);
}

/**
 * Browses `_difracta._tcp` until stopped, calling back with the whole list
 * each time a runtime appears, leaves or announces another record. Zeroconf
 * errors (no network, multicast refused) leave the list as it is. Returns the
 * stop.
 */
export function watchRuntimes(
  onChange: (runtimes: readonly DiscoveredRuntime[]) => void,
): () => void {
  let runtimes: DiscoveredRuntime[] = [];
  const apply = (event: RuntimeListEvent): void => {
    runtimes = runtimeListAfter(runtimes, event);
    onChange(runtimes);
  };
  const bonjour = new Bonjour({}, () => undefined);
  const browser = bonjour.find(query);
  browser.on("up", (service) => apply({ type: "up", service }));
  browser.on("down", (service) => apply({ type: "down", service }));
  browser.on("txt-update", (service) => apply({ type: "update", service }));
  browser.on("srv-update", (service) => apply({ type: "update", service }));
  return () => {
    browser.stop();
    bonjour.destroy();
  };
}
