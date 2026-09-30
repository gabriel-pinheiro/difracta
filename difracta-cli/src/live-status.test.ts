import {
  createBuiltInRegistry,
  emptyDocument,
  executeCommand,
  type Document,
} from "@difracta/core";
import type { LiveState, OutputTelemetry } from "@difracta/protocol";
import { describe, expect, it } from "vitest";

import { formatLiveStatus, liveStatus } from "./live-status.ts";

const registry = createBuiltInRegistry();

function stage(): Document {
  let document = emptyDocument("Living");
  for (const [name, payload] of [
    ["output.create", { id: "out_tv", name: "TV" }],
    ["output.create", { id: "out_wall", name: "Wall" }],
    ["scene.create", { id: "sc", name: "Live" }],
    [
      "layer.create",
      { id: "lay", sceneId: "sc", kind: "visual", name: "Wash" },
    ],
  ] as const) {
    const result = executeCommand(registry, document, name, payload);
    if (!result.ok) throw new Error(result.error);
    document = result.document;
  }
  return document;
}

const telemetry: OutputTelemetry = {
  width: 1920,
  height: 1080,
  pixelRatio: 1,
  frameIntervalMs: 16.7,
  renderWorkMs: 3.25,
  workload: {
    canvasVisuals: { executedPerFrame: 1, enabled: 1, relevant: 1 },
    shaderVisuals: { executedPerFrame: 0, enabled: 0, relevant: 0 },
    filters: { executedPerFrame: 0, enabled: 0, relevant: 0 },
    videos: { playing: 1, players: 4, layers: 6 },
  },
  issues: [{ layerId: "lay", definition: "plasma", message: "No WebGL2" }],
};

const live: LiveState = {
  osc: { port: 9000, listeners: 2 },
  displayHosts: {},
  media: {},
  outputs: {
    out_tv: {
      sessions: {
        s2: {
          sessionId: "s2",
          outputId: "out_tv",
          connectedAt: 20,
          reportedAt: null,
          stale: true,
          telemetry: null,
        },
        s1: {
          sessionId: "s1",
          outputId: "out_tv",
          connectedAt: 10,
          reportedAt: 30,
          stale: false,
          telemetry,
        },
      },
    },
  },
};

describe("liveStatus", () => {
  it("reduces each Output's Sessions to fps, render time, resolution and issues, in connection order", () => {
    expect(liveStatus(stage(), live)).toEqual({
      osc: { port: 9000, listeners: 2 },
      outputs: [
        {
          id: "out_tv",
          name: "TV",
          sessions: [
            {
              sessionId: "s1",
              connected: true,
              fps: 60,
              renderMs: 3.3,
              resolution: "1920×1080",
              videos: { playing: 1, players: 4, layers: 6, pastHardware: 0 },
              shares: null,
              issues: [
                {
                  layerId: "lay",
                  layer: "Wash",
                  definition: "plasma",
                  message: "No WebGL2",
                },
              ],
            },
            {
              sessionId: "s2",
              connected: false,
              fps: null,
              renderMs: null,
              resolution: null,
              videos: null,
              shares: null,
              issues: [],
            },
          ],
        },
        { id: "out_wall", name: "Wall", sessions: [] },
      ],
    });
  });

  it("treats a report without issues as clean and a closed OSC door as off", () => {
    const quiet: LiveState = {
      osc: { port: null, listeners: 0 },
      displayHosts: {},
      media: {},
      outputs: {
        out_tv: {
          sessions: {
            s1: {
              sessionId: "s1",
              outputId: "out_tv",
              connectedAt: 1,
              reportedAt: 2,
              stale: false,
              telemetry: { ...telemetry, issues: undefined },
            },
          },
        },
      },
    };
    const status = liveStatus(stage(), quiet);
    expect(status.outputs[0]?.sessions[0]?.issues).toEqual([]);
    expect(formatLiveStatus(status).at(-1)).toBe("OSC is off.");
  });

  it("warns when more video players play than hardware decoders work at once", () => {
    const busy: LiveState = {
      ...live,
      outputs: {
        out_tv: {
          sessions: {
            s1: {
              sessionId: "s1",
              outputId: "out_tv",
              connectedAt: 10,
              reportedAt: 30,
              stale: false,
              telemetry: {
                ...telemetry,
                issues: [],
                workload: {
                  ...telemetry.workload,
                  videos: { playing: 19, players: 30, layers: 40 },
                },
              },
            },
          },
        },
      },
    };
    const status = liveStatus(stage(), busy);
    expect(status.outputs[0]?.sessions[0]?.videos?.pastHardware).toBe(3);
    expect(formatLiveStatus(status).slice(1, 3)).toEqual([
      "  s1  connected  60 fps  3.3 ms  1920×1080  videos 19 playing / 30 players / 40 Layers",
      "    warning: more than 16 video players playing; the 3 past that may decode on the CPU",
    ]);
  });

  it("says the Screen Shares an Output views, and why it was refused as a Viewer", () => {
    const viewing: LiveState = {
      ...live,
      outputs: {
        out_tv: {
          sessions: {
            s1: {
              sessionId: "s1",
              outputId: "out_tv",
              connectedAt: 10,
              reportedAt: 30,
              stale: false,
              telemetry: {
                ...telemetry,
                issues: [],
                workload: {
                  ...telemetry.workload,
                  shares: {
                    viewed: 2,
                    connected: 1,
                    refused: "“Laptop” has its 8 Viewers.",
                  },
                },
              },
            },
          },
        },
      },
    };
    const status = liveStatus(stage(), viewing);
    expect(status.outputs[0]?.sessions[0]?.shares).toEqual({
      viewed: 2,
      connected: 1,
      refused: "“Laptop” has its 8 Viewers.",
    });
    expect(formatLiveStatus(status).slice(2, 4)).toEqual([
      "    Screen Shares: 1 connected / 2 viewed",
      "    warning: refused as a Viewer: “Laptop” has its 8 Viewers.",
    ]);
  });

  it("formats one line per Output, Session and issue", () => {
    expect(formatLiveStatus(liveStatus(stage(), live))).toEqual([
      "TV  out_tv",
      "  s1  connected  60 fps  3.3 ms  1920×1080  videos 1 playing / 4 players / 6 Layers",
      "    issue: Wash (plasma): No WebGL2",
      "  s2  stale  — fps  —  —",
      "Wall  out_wall  no Output Session",
      "OSC on port 9000, 2 OSCQuery listeners",
    ]);
  });
});
