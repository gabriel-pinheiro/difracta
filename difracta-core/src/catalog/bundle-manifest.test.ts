import { describe, expect, it } from "vitest";

import { mediaDefinitionsFromManifest } from "./bundle-manifest.ts";

const entry = {
  id: "hit-flash-cut",
  name: "Flash Cut",
  description: "A white flash.",
  notes: "On the downbeat.",
  file: "clips/hit-flash-cut.webm",
  type: "video",
  hit: true,
  thumbnailAt: 0.1,
  width: 1920,
  height: 1080,
  duration: 1.2,
};

describe("the Bundled Media manifest", () => {
  it("turns entries into media definitions, flags only when set", () => {
    expect(
      mediaDefinitionsFromManifest({ version: 1, items: [entry] }),
    ).toEqual([
      {
        kind: "media",
        id: "hit-flash-cut",
        name: "Flash Cut",
        description: "A white flash.",
        notes: "On the downbeat.",
        type: "video",
        file: "clips/hit-flash-cut.webm",
        width: 1920,
        height: 1080,
        hit: true,
        duration: 1.2,
      },
    ]);
    expect(mediaDefinitionsFromManifest({ version: 1, items: [] })).toEqual([]);
  });

  it("refuses a manifest that does not match the schema", () => {
    expect(() =>
      mediaDefinitionsFromManifest({
        version: 1,
        items: [{ ...entry, loop: false }],
      }),
    ).toThrow("not valid");
    expect(() =>
      mediaDefinitionsFromManifest({ version: 2, items: [] }),
    ).toThrow("not valid");
    expect(() =>
      mediaDefinitionsFromManifest({
        version: 1,
        items: [{ ...entry, extra: 1 }],
      }),
    ).toThrow("not valid");
  });
});
