import type { DiscoveredRuntime } from "@difracta/client/discovery";
import { describe, expect, it } from "vitest";

import type { LaunchRuntime } from "./launch-contract.ts";
import { LaunchRuntimes } from "./launch-runtimes.ts";

const runtime = (
  host: string,
  address: string,
  port = 4800,
): DiscoveredRuntime => ({
  name: `Difracta on ${host}`,
  host: `${host}.local`,
  address,
  port,
  version: "1.0.0",
  document: "Living",
});

/** A browser the test drives by hand. */
function network() {
  let report: ((runtimes: readonly DiscoveredRuntime[]) => void) | undefined;
  const runtimes = new LaunchRuntimes({
    watch: (onChange) => {
      report = onChange;
      return () => {
        report = undefined;
      };
    },
    machine: () => ({ hostname: "laptop", addresses: ["192.168.1.7"] }),
  });
  return {
    runtimes,
    browsing: () => report !== undefined,
    finds: (...found: DiscoveredRuntime[]) => report?.(found),
  };
}

describe("the launch page's runtimes", () => {
  it("browses only while the page is open, pushing each change", () => {
    const { runtimes, browsing, finds } = network();
    expect(browsing()).toBe(false);
    const pushed: LaunchRuntime[][] = [];
    runtimes.open((list) => pushed.push(list));
    expect(browsing()).toBe(true);

    finds(runtime("stage-pc", "10.0.0.5"), runtime("v6", "fe80::5", 4900));
    expect(pushed.at(-1)).toEqual([
      {
        name: "Difracta on stage-pc",
        host: "stage-pc.local",
        address: "10.0.0.5:4800",
        version: "1.0.0",
        document: "Living",
      },
      expect.objectContaining({ address: "[fe80::5]:4900" }),
    ]);
    expect(runtimes.nameAt("http://10.0.0.5:4800")).toBe(
      "Difracta on stage-pc",
    );
    expect(runtimes.nameAt("http://10.0.0.6:4800")).toBeNull();

    runtimes.close();
    expect(browsing()).toBe(false);
    expect(runtimes.list()).toEqual([]);
  });

  it("leaves out the runtime Desktop itself runs, from the moment it starts", () => {
    const { runtimes, finds } = network();
    const pushed: LaunchRuntime[][] = [];
    runtimes.open((list) => pushed.push(list));
    finds(runtime("laptop", "192.168.1.7"), runtime("stage-pc", "10.0.0.5"));
    expect(runtimes.list()).toHaveLength(2);

    runtimes.setLocalPort(4800);
    expect(pushed.at(-1)?.map((entry) => entry.address)).toEqual([
      "10.0.0.5:4800",
    ]);
    runtimes.setLocalPort(undefined);
    expect(pushed.at(-1)).toHaveLength(2);
  });
});
