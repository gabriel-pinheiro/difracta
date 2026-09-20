import { settings } from "@difracta/core";
import { Bonjour } from "bonjour-service";

/** A runtime that answered on the local network, as `difracta runtimes` lists it. */
export interface DiscoveredRuntime {
  /** The announced instance, "Difracta on <hostname>". */
  readonly name: string;
  readonly host: string;
  /** The address to reach it at; with `port`, what `--url` takes. */
  readonly address: string;
  readonly port: number;
  readonly version: string | null;
  /** The open Installation's name; null when nothing is open. */
  readonly document: string | null;
}

/** The part of a browsed Zeroconf service a listing needs. */
export interface BrowsedService {
  readonly name: string;
  readonly host: string;
  readonly port: number;
  readonly addresses?: readonly string[] | undefined;
  readonly referer?: { readonly address: string } | undefined;
  readonly txt?: unknown;
}

const isIPv4 = (address: string): boolean => /^\d+(\.\d+){3}$/.test(address);

function txtValue(txt: unknown, key: string): string | null {
  if (typeof txt !== "object" || txt === null) return null;
  const value = (txt as Record<string, unknown>)[key];
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * A machine announces every address it has. The one its answer came from is
 * on a network this shell shares with it, so it wins; an IPv4 one is next.
 */
export function runtimeFrom(service: BrowsedService): DiscoveredRuntime {
  const addresses = service.addresses ?? [];
  const heardFrom = service.referer?.address;
  const address =
    (heardFrom !== undefined && addresses.includes(heardFrom)
      ? heardFrom
      : addresses.find(isIPv4)) ??
    heardFrom ??
    service.host;
  return {
    name: service.name,
    host: service.host,
    address,
    port: service.port,
    version: txtValue(service.txt, "version"),
    document: txtValue(service.txt, "document"),
  };
}

export function formatRuntimes(
  runtimes: readonly DiscoveredRuntime[],
  listenedMs: number,
): string {
  if (runtimes.length === 0)
    return `No runtime answered within ${String(listenedMs / 1000)} s. A network that blocks multicast hides them; --url <host:port> still reaches one.`;
  const rows = runtimes.map((runtime) => [
    runtime.name,
    `${runtime.address}:${String(runtime.port)}`,
    runtime.host,
    runtime.version ?? "?",
    runtime.document ?? "(no Installation)",
  ]);
  const widths = rows.reduce<number[]>(
    (all, row) => row.map((cell, i) => Math.max(all[i] ?? 0, cell.length)),
    [],
  );
  return rows
    .map((row) =>
      row
        .map((cell, i) => cell.padEnd(widths[i] ?? 0))
        .join("  ")
        .trimEnd(),
    )
    .join("\n");
}

/**
 * Browses `_difracta._tcp` for `listenMs` and returns whoever answered, this
 * machine's runtimes included, sorted by name.
 */
export async function browseRuntimes(
  listenMs: number = settings.discovery.browseMs,
): Promise<DiscoveredRuntime[]> {
  const bonjour = new Bonjour({}, () => undefined);
  const browser = bonjour.find({
    type: settings.discovery.serviceType,
    protocol: "tcp",
  });
  await new Promise((resolve) => setTimeout(resolve, listenMs));
  const runtimes = browser.services.map((service) => runtimeFrom(service));
  browser.stop();
  await new Promise<void>((resolve) => {
    bonjour.destroy(() => resolve());
  });
  return runtimes.sort(
    (a, b) => a.name.localeCompare(b.name) || a.port - b.port,
  );
}
