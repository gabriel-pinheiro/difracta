import { describe, expect, it } from "vitest";

import { runtimeFrom } from "./discovered-runtime.ts";

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
});
