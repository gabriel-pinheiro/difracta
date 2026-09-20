import { describe, expect, it } from "vitest";

import { formatRuntimes } from "./discovery.ts";

describe("discovered runtimes", () => {
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
