import type { Output, Table } from "@difracta/core";
import type { DisplayHostLive } from "@difracta/protocol";
import { describe, expect, it } from "vitest";

import { displayHostRows } from "./display-rows";

function host(
  id: string,
  connectedAt: number,
  showing: Record<string, string> = {},
): DisplayHostLive {
  return {
    id,
    sessionId: `session-${id}`,
    connectedAt,
    name: id.toUpperCase(),
    displays: [
      {
        id: "1",
        label: "Built-in",
        bounds: { x: 0, y: 0, width: 1440, height: 900 },
        scaleFactor: 2,
        primary: true,
        internal: true,
      },
      {
        id: "2",
        label: "EPSON PJ",
        bounds: { x: 1440, y: 0, width: 1920, height: 1080 },
        scaleFactor: 1,
        primary: false,
        internal: false,
      },
    ],
    showing,
  };
}

const outputs = {
  wall: { id: "wall", name: "Wall" },
} as unknown as Table<Output>;

describe("the Display Hosts of the Open Output dialog", () => {
  it("lists nothing while no host is connected", () => {
    expect(displayHostRows(undefined, outputs)).toEqual([]);
    expect(displayHostRows({}, outputs)).toEqual([]);
  });

  it("groups Displays by host, the host connected longest first", () => {
    const rows = displayHostRows(
      { laptop: host("laptop", 20), stage: host("stage", 10) },
      outputs,
    );
    expect(rows.map((row) => [row.id, row.name])).toEqual([
      ["stage", "STAGE"],
      ["laptop", "LAPTOP"],
    ]);
  });

  it("gives each Display its resolution in device pixels, its marks and the Output it shows", () => {
    const [stage] = displayHostRows(
      { stage: host("stage", 1, { "1": "gone", "2": "wall" }) },
      outputs,
    );
    expect(stage?.displays).toEqual([
      {
        id: "1",
        label: "Built-in",
        resolution: "2880×1800",
        marks: ["primary", "internal"],
        shows: { id: "gone", name: "gone" },
      },
      {
        id: "2",
        label: "EPSON PJ",
        resolution: "1920×1080",
        marks: [],
        shows: { id: "wall", name: "Wall" },
      },
    ]);
  });
});
