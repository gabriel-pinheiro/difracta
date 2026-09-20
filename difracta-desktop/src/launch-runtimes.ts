import type { DiscoveredRuntime } from "@difracta/client/discovery";

import type { LaunchRuntime } from "./launch-contract.ts";
import { offeredRuntimes, type Machine } from "./own-machine.ts";
import { addressLabel, parseRuntimeAddress } from "./runtime-address.ts";

/** Starts browsing, calls back with every new list, returns the stop; `watchRuntimes` is the real one. */
export type RuntimeWatch = (
  onChange: (runtimes: readonly DiscoveredRuntime[]) => void,
) => () => void;

/** Where a discovered runtime is reached, normalised like a typed address. */
function originOf(runtime: DiscoveredRuntime): string | undefined {
  const host = runtime.address.includes(":")
    ? `[${runtime.address}]`
    : runtime.address;
  const parsed = parseRuntimeAddress(`${host}:${String(runtime.port)}`);
  return parsed.ok ? parsed.origin : undefined;
}

/**
 * The launch page's live list. Browsing the network lasts exactly as long as
 * the page is open: `open` starts it, `close` stops it, and every change in
 * between is pushed to the page already filtered by `offeredRuntimes`.
 */
export class LaunchRuntimes {
  readonly #watch: RuntimeWatch;
  readonly #machine: () => Machine;
  #discovered: readonly DiscoveredRuntime[] = [];
  #localPort: number | undefined;
  #push: ((runtimes: LaunchRuntime[]) => void) | undefined;
  #stop: (() => void) | undefined;

  constructor(options: {
    readonly watch: RuntimeWatch;
    /** Asked on every change: a laptop changes networks while the page is open. */
    readonly machine: () => Machine;
  }) {
    this.#watch = options.watch;
    this.#machine = options.machine;
  }

  open(push: (runtimes: LaunchRuntime[]) => void): void {
    this.close();
    this.#push = push;
    this.#stop = this.#watch((runtimes) => {
      this.#discovered = runtimes;
      this.#push?.(this.list());
    });
  }

  close(): void {
    this.#stop?.();
    this.#stop = undefined;
    this.#push = undefined;
    this.#discovered = [];
  }

  /** The port of the runtime Desktop itself is starting or running, which the list leaves out. */
  setLocalPort(port: number | undefined): void {
    if (port === this.#localPort) return;
    this.#localPort = port;
    this.#push?.(this.list());
  }

  list(): LaunchRuntime[] {
    return this.#offered().flatMap((runtime) => {
      const origin = originOf(runtime);
      return origin === undefined
        ? []
        : [
            {
              name: runtime.name,
              host: runtime.host,
              address: addressLabel(origin),
              version: runtime.version,
              document: runtime.document,
            },
          ];
    });
  }

  /** The name the runtime at `origin` announces, or null when it is not on the list. */
  nameAt(origin: string): string | null {
    return (
      this.#offered().find((runtime) => originOf(runtime) === origin)?.name ??
      null
    );
  }

  #offered(): DiscoveredRuntime[] {
    return offeredRuntimes(this.#discovered, this.#machine(), this.#localPort);
  }
}
