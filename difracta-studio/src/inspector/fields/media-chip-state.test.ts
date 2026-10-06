import type { PackLive } from "@difracta/protocol";
import { describe, expect, it } from "vitest";

import { chipState } from "./media-chip-state";

const neon: PackLive = {
  name: "Neon VJ",
  readOnly: false,
  status: "ok",
  folder: "/p/neon",
  ffmpeg: true,
  prepared: { done: 1, total: 1 },
  entries: {
    tunnel: {
      id: "tunnel",
      file: "tunnel.mp4",
      type: "video",
      name: "Tunnel",
      tags: [],
      fingerprint: "0123456789abcdef-1",
      status: "ok",
      hasThumbnail: true,
      proxies: [480],
    },
  },
};
const packs = {
  "neon-k7f3": neon,
  lost: { ...neon, name: "Lost Pack", status: "missing" as const },
};
const attached = {
  "neon-k7f3": { id: "neon-k7f3", name: "Neon VJ" },
  lost: { id: "lost", name: "Lost Pack" },
  gone: { id: "gone", name: "Gone Pack" },
};

describe("A media chip's state", () => {
  it("is empty for none and invalid for a value that is not a reference", () => {
    expect(chipState("", packs, attached)).toEqual({ kind: "empty" });
    expect(chipState("media_abc", packs, attached)).toEqual({
      kind: "invalid",
      value: "media_abc",
    });
  });

  it("names a missing Pack from the runtime or the Installation's copy", () => {
    expect(chipState("lost/x", packs, attached)).toEqual({
      kind: "missing-pack",
      packId: "lost",
      packName: "Lost Pack",
    });
    expect(chipState("gone/x", packs, attached)).toMatchObject({
      kind: "missing-pack",
      packName: "Gone Pack",
    });
    expect(chipState("other/x", packs, attached)).toMatchObject({
      kind: "missing-pack",
      packName: "other",
    });
  });

  it("tells a missing entry from one that is there", () => {
    expect(chipState("neon-k7f3/nope", packs, attached)).toEqual({
      kind: "missing-entry",
      packId: "neon-k7f3",
      packName: "Neon VJ",
      entryId: "nope",
    });
    expect(chipState("neon-k7f3/tunnel", packs, attached)).toMatchObject({
      kind: "entry",
      reference: "neon-k7f3/tunnel",
      packName: "Neon VJ",
      entry: { name: "Tunnel" },
    });
  });
});
