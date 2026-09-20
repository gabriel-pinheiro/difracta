import type { DiscoveredRuntime } from "@difracta/client/discovery";

/** This computer as the network knows it: `os.hostname()` and every interface's address. */
export interface Machine {
  readonly hostname: string;
  readonly addresses: readonly string[];
}

/** A Zeroconf host is "name.local."; a hostname may or may not carry a domain. */
const bareHost = (host: string): string =>
  host
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/\.local$/, "");

/**
 * Whether a discovered runtime runs on this computer: it announced this
 * computer's hostname, or the address it is reached at is one of this
 * computer's own. The address is the one its answer came from whenever it
 * announced that one (see `runtimeFrom`), which is why the whole announced
 * list is not compared: every machine with Docker announces the same
 * `172.17.0.1`.
 */
export function isOwnMachine(
  runtime: DiscoveredRuntime,
  machine: Machine,
): boolean {
  return (
    bareHost(runtime.host) === bareHost(machine.hostname) ||
    machine.addresses.includes(runtime.address)
  );
}

/**
 * The runtimes the launch page offers. Exactly one is ever hidden: the
 * runtime Desktop itself is starting or running, which is this computer's on
 * `localPort`, and is what "Run on this computer" already means. With no
 * local runtime (`localPort` undefined), a runtime on this computer is a
 * target like any other: a `difracta-runtime` service, or one on another
 * port, is reached by connecting to it.
 */
export function offeredRuntimes(
  runtimes: readonly DiscoveredRuntime[],
  machine: Machine,
  localPort: number | undefined,
): DiscoveredRuntime[] {
  return runtimes.filter(
    (runtime) =>
      !(runtime.port === localPort && isOwnMachine(runtime, machine)),
  );
}
