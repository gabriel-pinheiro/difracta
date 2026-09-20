import { describe, expect, it } from "vitest";

import { forgetRuntime, rememberRuntime } from "./remembered-runtimes.ts";

const stage = { origin: "http://10.0.0.5:4800", name: "Difracta on stage-pc" };
const typed = { origin: "http://10.0.0.9:4800", name: null };

describe("remembered runtimes", () => {
  it("puts the newest first and lists a runtime once", () => {
    const list = rememberRuntime(rememberRuntime([], stage, 5), typed, 5);
    expect(list).toEqual([typed, stage]);
    expect(rememberRuntime(list, stage, 5)).toEqual([stage, typed]);
  });

  it("follows a named runtime to the address it has now", () => {
    const moved = { ...stage, origin: "http://10.0.0.77:4800" };
    expect(rememberRuntime([typed, stage], moved, 5)).toEqual([moved, typed]);
    // Two typed addresses share the name null and stay two runtimes.
    const other = { origin: "http://10.0.0.10:4800", name: null };
    expect(rememberRuntime([typed], other, 5)).toEqual([other, typed]);
  });

  it("drops the oldest past the limit, and what is forgotten", () => {
    expect(rememberRuntime([typed, stage], stage, 1)).toEqual([stage]);
    expect(forgetRuntime([typed, stage], typed.origin)).toEqual([stage]);
    expect(forgetRuntime([stage], "http://nowhere:1")).toEqual([stage]);
  });
});
