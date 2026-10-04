import {
  createBuiltInRegistry,
  emptyDocument,
  executeCommand,
  type Document,
} from "@difracta/core";
import type { LiveState, PackEntryLive } from "@difracta/protocol";

/** Fixtures the CLI's Pack and Media tests share: an Installation with three attached Packs and the live slice the runtime would hold. */
const registry = createBuiltInRegistry();

/** Two attached Packs, one of them missing here, beside the Bundled Pack. */
export function stage(): Document {
  let document = emptyDocument("Living");
  for (const [name, payload] of [
    ["packs.attach", { packId: "neon-k7f3", name: "Neon" }],
    ["packs.attach", { packId: "neon-x1y2", name: "Neon" }],
    [
      "packs.attach",
      { packId: "tour-a9b8", name: "Tour", relativePath: "../tour" },
    ],
  ] as const) {
    const result = executeCommand(registry, document, name, payload);
    if (!result.ok) throw new Error(result.error);
    document = result.document;
  }
  return document;
}

export function entry(
  id: string,
  file: string,
  more: Partial<PackEntryLive> = {},
): PackEntryLive {
  return {
    id,
    file,
    type: file.endsWith(".png") ? "image" : "video",
    name: id,
    tags: [],
    fingerprint: "0123456789abcdef-1k9z",
    status: "ok",
    hasThumbnail: true,
    hasProxy: !file.endsWith(".png"),
    ...more,
  };
}

/** The live slice: Bundled and the first Neon loaded, the second Neon and Tour not. */
export const packs: LiveState["packs"] = {
  bundled: {
    name: "Bundled",
    readOnly: true,
    status: "ok",
    folder: "/opt/difracta/bundled",
    ffmpeg: true,
    prepared: { done: 1, total: 1 },
    entries: {
      "beam-scan-loop": entry("beam-scan-loop", "clips/beam-scan-loop.webm", {
        name: "Beam Scan",
        tags: ["loop"],
        width: 1920,
        height: 1080,
        duration: 7.1,
        beats: 16,
      }),
    },
  },
  "neon-k7f3": {
    name: "Neon",
    readOnly: false,
    status: "ok",
    folder: "/media/neon",
    ffmpeg: true,
    prepared: { done: 2, total: 3 },
    entries: {
      "tunnels-04": entry("tunnels-04", "tunnels/04.mp4"),
      "tunnels-04-2": entry("tunnels-04-2", "Tunnels/04.MP4"),
      logo: entry("logo", "logo.png", { status: "missing" }),
    },
  },
  "tour-a9b8": {
    name: "Tour",
    readOnly: false,
    status: "missing",
    folder: "",
    ffmpeg: true,
    prepared: { done: 0, total: 0 },
    entries: {},
  },
};
