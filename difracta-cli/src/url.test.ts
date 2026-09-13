import { describe, expect, it } from "vitest";

import { normalizeUrl } from "./url.ts";

describe("normalizeUrl", () => {
  it("keeps a live websocket URL as typed", () => {
    expect(normalizeUrl("ws://127.0.0.1:4879/live")).toBe(
      "ws://127.0.0.1:4879/live",
    );
    expect(normalizeUrl("wss://rig.local:4800/live")).toBe(
      "wss://rig.local:4800/live",
    );
  });

  it("turns the runtime's http address into its live websocket", () => {
    expect(normalizeUrl("http://127.0.0.1:4879")).toBe(
      "ws://127.0.0.1:4879/live",
    );
    expect(normalizeUrl("https://rig.example:4800/")).toBe(
      "wss://rig.example:4800/live",
    );
  });

  it("accepts a bare host:port, and a bare host on the default port", () => {
    expect(normalizeUrl("192.168.1.20:4879")).toBe(
      "ws://192.168.1.20:4879/live",
    );
    expect(normalizeUrl("rig.local")).toBe("ws://rig.local:4800/live");
    expect(normalizeUrl("ws://rig.local")).toBe("ws://rig.local:4800/live");
  });

  it("refuses other schemes and garbage", () => {
    expect(() => normalizeUrl("ftp://rig:21")).toThrow("Not a runtime URL");
    expect(() => normalizeUrl("http://")).toThrow("Not a runtime URL");
    expect(() => normalizeUrl("  ")).toThrow("empty");
  });
});
