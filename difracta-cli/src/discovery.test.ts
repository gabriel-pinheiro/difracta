import { describe, expect, it } from "vitest";

import { formatRuntimes, runtimeFrom } from "./discovery.ts";

describe("discovered runtimes", () => {
  it("reads the version and the Installation from the TXT record", () => {
    expect(
      runtimeFrom({
        name: "Difracta on mini-pc",
        host: "mini-pc.local",
        port: 4800,
        addresses: ["192.168.1.20"],
        txt: { version: "1.2.3", document: "Living" },
      }),
    ).toEqual({
      name: "Difracta on mini-pc",
      host: "mini-pc.local",
      address: "192.168.1.20",
      port: 4800,
      version: "1.2.3",
      document: "Living",
    });
    expect(
      runtimeFrom({ name: "n", host: "h", port: 1, txt: undefined }),
    ).toMatchObject({ address: "h", version: null, document: null });
  });

  it("prefers the address the answer came from, then an IPv4 one", () => {
    const service = {
      name: "n",
      host: "h.local",
      port: 4800,
      addresses: ["fe80::1", "172.17.0.1", "192.168.1.20"],
    };
    expect(
      runtimeFrom({ ...service, referer: { address: "192.168.1.20" } }).address,
    ).toBe("192.168.1.20");
    expect(
      runtimeFrom({ ...service, referer: { address: "10.0.0.9" } }).address,
    ).toBe("172.17.0.1");
    expect(
      runtimeFrom({
        ...service,
        addresses: [],
        referer: { address: "10.0.0.9" },
      }).address,
    ).toBe("10.0.0.9");
  });

  it("lists one aligned line per runtime, or says why the list may be empty", () => {
    const lines = formatRuntimes(
      [
        {
          name: "Difracta on laptop (4900)",
          host: "laptop.local",
          address: "192.168.1.7",
          port: 4900,
          version: "1.2.3",
          document: null,
        },
        {
          name: "Difracta on mini-pc",
          host: "mini-pc.local",
          address: "192.168.1.20",
          port: 4800,
          version: null,
          document: "Living",
        },
      ],
      1_500,
    ).split("\n");
    expect(lines).toEqual([
      "Difracta on laptop (4900)  192.168.1.7:4900   laptop.local   1.2.3  (no Installation)",
      "Difracta on mini-pc        192.168.1.20:4800  mini-pc.local  ?      Living",
    ]);
    expect(formatRuntimes([], 1_500)).toMatch(/within 1\.5 s.*multicast/);
  });
});
