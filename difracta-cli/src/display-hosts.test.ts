import type { DisplayHostLive } from "@difracta/protocol";
import { describe, expect, it } from "vitest";

import { formatDisplayHosts } from "./display-hosts.ts";

const host: DisplayHostLive = {
  id: "stage-pc",
  sessionId: "session_1",
  connectedAt: 1,
  name: "Stage PC",
  displays: [
    {
      id: "1",
      label: "Built-in",
      bounds: { x: 0, y: 0, width: 1920, height: 1200 },
      scaleFactor: 2,
      primary: true,
      internal: true,
    },
    {
      id: "22",
      label: "Projector",
      bounds: { x: 1920, y: 0, width: 1920, height: 1080 },
      scaleFactor: 1,
      primary: false,
      internal: false,
    },
  ],
  showing: { "22": "out_wall" },
};

describe("the Display Hosts listing", () => {
  it("says so when no host is connected", () => {
    expect(formatDisplayHosts([], [])).toBe("No Display Host is connected.");
  });

  it("lists each host's Displays in columns with what they show", () => {
    expect(
      formatDisplayHosts([host], [{ id: "out_wall", name: "Wall" }]).split(
        "\n",
      ),
    ).toEqual([
      "stage-pc  Stage PC  2 Displays",
      "  1   Built-in   1920×1200 at 0,0     ×2  primary internal  shows nothing",
      "  22  Projector  1920×1080 at 1920,0  ×1                    shows Wall (out_wall)",
    ]);
  });

  it("keeps the id of an Output the open Installation does not have", () => {
    const lines = formatDisplayHosts(
      [{ ...host, displays: host.displays.slice(1) }],
      [],
    ).split("\n");
    expect(lines[0]).toBe("stage-pc  Stage PC  1 Display");
    expect(lines[1]?.endsWith("shows out_wall")).toBe(true);
  });
});
