import { describe, expect, it } from "vitest";

import { runtimeRows } from "./runtime-rows";

const stage = {
  name: "Difracta on stage-pc",
  host: "stage-pc.local",
  address: "10.0.0.5:4800",
  version: "1.0.0",
  document: "Living",
};

describe("launch page rows", () => {
  it("lists what is on the network, then what is only remembered", () => {
    const rows = runtimeRows(
      [stage],
      [
        { address: "10.0.0.9:4800", name: null },
        { address: "10.0.0.5:4800", name: "Difracta on stage-pc" },
        { address: "10.0.0.7:4800", name: "Difracta on booth" },
      ],
    );
    expect(rows).toEqual([
      {
        address: "10.0.0.5:4800",
        title: "Difracta on stage-pc",
        found: stage,
        remembered: true,
      },
      {
        address: "10.0.0.9:4800",
        title: "10.0.0.9:4800",
        found: undefined,
        remembered: true,
      },
      {
        address: "10.0.0.7:4800",
        title: "Difracta on booth",
        found: undefined,
        remembered: true,
      },
    ]);
  });

  it("follows a remembered name to the address it is found at now", () => {
    const rows = runtimeRows(
      [stage],
      [{ address: "10.0.0.123:4800", name: "Difracta on stage-pc" }],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      address: "10.0.0.5:4800",
      remembered: true,
    });
  });

  it("marks a runtime never connected to as not remembered", () => {
    expect(runtimeRows([stage], [])[0]?.remembered).toBe(false);
    expect(runtimeRows([], [])).toEqual([]);
  });
});
