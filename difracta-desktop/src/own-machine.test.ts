import type { DiscoveredRuntime } from "@difracta/client/discovery";
import { describe, expect, it } from "vitest";

import { isOwnMachine, offeredRuntimes } from "./own-machine.ts";

const machine = {
  hostname: "Laptop",
  addresses: ["127.0.0.1", "192.168.1.7", "172.17.0.1", "fe80::7"],
};

const runtime = (
  host: string,
  address: string,
  port = 4800,
): DiscoveredRuntime => ({
  name: `Difracta on ${host}`,
  host,
  address,
  port,
  version: "1.0.0",
  document: null,
});

describe("own machine", () => {
  it("knows its hostname however Zeroconf spells it", () => {
    for (const host of ["laptop", "laptop.local", "LAPTOP.local."])
      expect(isOwnMachine(runtime(host, "10.9.9.9"), machine), host).toBe(true);
    expect(isOwnMachine(runtime("laptop-2.local", "10.9.9.9"), machine)).toBe(
      false,
    );
  });

  it("knows its own addresses", () => {
    expect(isOwnMachine(runtime("renamed.local", "192.168.1.7"), machine)).toBe(
      true,
    );
    expect(
      isOwnMachine(runtime("mini-pc.local", "192.168.1.20"), machine),
    ).toBe(false);
  });

  it("hides only the runtime Desktop itself runs", () => {
    const own = runtime("laptop.local", "192.168.1.7");
    const ownOtherPort = runtime("laptop.local", "192.168.1.7", 4900);
    const other = runtime("mini-pc.local", "192.168.1.20");
    const all = [own, ownOtherPort, other];
    expect(offeredRuntimes(all, machine, 4800)).toEqual([ownOtherPort, other]);
    expect(offeredRuntimes(all, machine, 4900)).toEqual([own, other]);
  });

  it("offers this computer's runtimes while Desktop runs none", () => {
    const own = runtime("laptop.local", "192.168.1.7");
    expect(offeredRuntimes([own], machine, undefined)).toEqual([own]);
  });
});
