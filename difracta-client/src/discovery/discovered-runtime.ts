/** A runtime that announced itself on the local network as `_difracta._tcp`. */
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
 * on a network this machine shares with it, so it wins; an IPv4 one is next.
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

/** The order every listing uses: by name, then by port. */
export function sortRuntimes(
  runtimes: readonly DiscoveredRuntime[],
): DiscoveredRuntime[] {
  return [...runtimes].sort(
    (a, b) => a.name.localeCompare(b.name) || a.port - b.port,
  );
}
