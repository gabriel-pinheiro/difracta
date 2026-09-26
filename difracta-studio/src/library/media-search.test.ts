import type { MediaDefinition } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { firstMedia, rankMedia } from "./media-search.ts";

function entry(
  id: string,
  name: string,
  extra: Partial<MediaDefinition> = {},
): MediaDefinition {
  return {
    kind: "media",
    id,
    name,
    description: `${name} on a Surface.`,
    type: "video",
    file: `clips/${id}.webm`,
    width: 1920,
    height: 1080,
    duration: 4,
    ...extra,
  };
}

const bundle = [
  entry("beam", "Beam Scan", {
    loop: true,
    notes: "Reads as a lighting rig over a stage backdrop.",
  }),
  entry("flash", "Flash Cut", { hit: true, recommended: true }),
  entry("tunnel", "Tunnel Grid", { loop: true, recommended: true }),
  entry("still", "Still Grid", { type: "image" }),
];

const ids = (entries: readonly MediaDefinition[]): string[] =>
  entries.map((item) => item.id);

describe("Bundled Media search", () => {
  it("puts Recommended entries first, then names", () => {
    expect(ids(rankMedia(bundle, ""))).toEqual([
      "flash",
      "tunnel",
      "beam",
      "still",
    ]);
  });

  it("narrows by the Loop and Hit facets and by the accepted type", () => {
    expect(ids(rankMedia(bundle, "", { loop: "yes", hit: "any" }))).toEqual([
      "tunnel",
      "beam",
    ]);
    expect(ids(rankMedia(bundle, "", { loop: "any", hit: "yes" }))).toEqual([
      "flash",
    ]);
    expect(
      ids(rankMedia(bundle, "", { loop: "any", hit: "any" }, "image")),
    ).toEqual(["still"]);
  });

  it("searches names, then descriptions, then notes", () => {
    expect(ids(rankMedia(bundle, "grid"))).toEqual(["tunnel", "still"]);
    expect(ids(rankMedia(bundle, "backdrop"))).toEqual(["beam"]);
  });

  it("starts a new item on the first tile, of the accepted type", () => {
    expect(firstMedia(bundle)?.id).toBe("flash");
    expect(firstMedia(bundle, "image")?.id).toBe("still");
    expect(firstMedia([], "video")).toBeUndefined();
  });
});
