import { describe, expect, it } from "vitest";

import type { DiscoveredRuntime } from "./discovered-runtime.ts";
import { runtimeListAfter, type RuntimeListEvent } from "./runtime-list.ts";

const service = (name: string, document?: string) => ({
  name,
  host: `${name}.local`,
  port: 4800,
  addresses: ["192.168.1.20"],
  txt: document === undefined ? {} : { document },
});

function after(events: readonly RuntimeListEvent[]): DiscoveredRuntime[] {
  return events.reduce<DiscoveredRuntime[]>(runtimeListAfter, []);
}

describe("the list of discovered runtimes", () => {
  it("adds a runtime that comes up, sorted by name, and drops one that goes down", () => {
    const up = after([
      { type: "up", service: service("stage") },
      { type: "up", service: service("booth") },
    ]);
    expect(up.map((runtime) => runtime.name)).toEqual(["booth", "stage"]);
    expect(
      runtimeListAfter(up, { type: "down", service: service("booth") }).map(
        (runtime) => runtime.name,
      ),
    ).toEqual(["stage"]);
  });

  it("replaces a runtime whose record changed instead of listing it twice", () => {
    const list = after([
      { type: "up", service: service("stage", "Living") },
      { type: "update", service: service("stage", "Tonight") },
      // A new TXT record from the runtime is a goodbye and a fresh "up".
      { type: "up", service: { ...service("stage", "Encore"), port: 4900 } },
    ]);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ document: "Encore", port: 4900 });
  });

  it("ignores a goodbye from a runtime it never listed", () => {
    expect(after([{ type: "down", service: service("ghost") }])).toEqual([]);
  });
});
