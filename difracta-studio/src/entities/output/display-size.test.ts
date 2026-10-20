import type { DisplayHostLive, OutputSessionLive } from "@difracta/protocol";
import { describe, expect, it } from "vitest";

import { offeredDisplaySize, showingDisplay } from "./display-size";

const hosts = {
  late: {
    id: "late",
    name: "Booth",
    connectedAt: 2,
    displays: [
      {
        id: "d1",
        label: "",
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        scaleFactor: 1,
      },
      {
        id: "d2",
        label: "LED processor",
        bounds: { x: 0, y: 0, width: 960, height: 540 },
        scaleFactor: 2,
      },
    ],
    showing: { d2: "led" },
  },
} as unknown as Record<string, DisplayHostLive>;

const session = {
  telemetry: { width: 1280, height: 720 },
  reportedAt: 1,
} as unknown as OutputSessionLive;

describe("offeredDisplaySize", () => {
  it("prefers a Display showing the Output, in device pixels", () => {
    expect(showingDisplay(hosts, "led")).toEqual({
      label: "LED processor",
      size: { width: 1920, height: 1080 },
    });
    expect(offeredDisplaySize(hosts, [session], "led").source).toEqual({
      kind: "display",
      label: "LED processor",
    });
  });

  it("falls back to the session's size, then to the usual HDMI size", () => {
    expect(offeredDisplaySize(hosts, [session], "tv")).toEqual({
      size: { width: 1280, height: 720 },
      source: { kind: "session" },
    });
    expect(offeredDisplaySize(undefined, [], "tv")).toEqual({
      size: { width: 1920, height: 1080 },
      source: { kind: "fallback" },
    });
  });
});
