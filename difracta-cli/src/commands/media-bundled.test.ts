import {
  Catalog,
  createBuiltInRegistry,
  emptyDocument,
  executeCommand,
  type MediaDefinition,
} from "@difracta/core";
import { describe, expect, it } from "vitest";

import {
  describeBundled,
  formatBundled,
  resolveBundled,
  resolveBundledPayload,
} from "./media-bundled.ts";
import { formatMedia, listMedia } from "./media.ts";

const flash: MediaDefinition = {
  kind: "media",
  id: "hit-flash-cut",
  name: "Flash Cut",
  description: "A white flash.",
  notes: "On the downbeat.",
  type: "video",
  hit: true,
  file: "clips/hit-flash-cut.webm",
  width: 1920,
  height: 1080,
  duration: 1.2,
};
const beam: MediaDefinition = {
  kind: "media",
  id: "beam-scan-loop",
  name: "Beam Scan",
  description: "Beams.",
  type: "video",
  loop: true,
  recommended: true,
  file: "clips/beam-scan-loop.webm",
  width: 1920,
  height: 1080,
  duration: 7.1,
};
const catalog = new Catalog({ media: [flash, beam] });

describe("Bundled Media at the CLI", () => {
  it("resolves an entry by id or name, and refuses one nothing has", () => {
    expect(resolveBundled(catalog, "hit-flash-cut")).toBe("hit-flash-cut");
    expect(resolveBundled(catalog, " flash cut ")).toBe("hit-flash-cut");
    expect(() => resolveBundled(catalog, "Strobe")).toThrow("media bundled");
  });

  it("turns a run payload's bundled name into an id, fetching the Catalog only then", async () => {
    let fetched = 0;
    const fetch = () => {
      fetched += 1;
      return Promise.resolve(catalog);
    };
    expect(
      await resolveBundledPayload(
        "media.create",
        { kind: "bundled", bundled: "Beam Scan" },
        fetch,
      ),
    ).toEqual({ kind: "bundled", bundled: "beam-scan-loop" });
    expect(
      await resolveBundledPayload(
        "media.bundled",
        { mediaId: "x", bundled: "hit-flash-cut" },
        fetch,
      ),
    ).toEqual({ mediaId: "x", bundled: "hit-flash-cut" });
    expect(fetched).toBe(2);
    await resolveBundledPayload("media.create", { path: "a.png" }, fetch);
    await resolveBundledPayload("media.path", { bundled: "x" }, fetch);
    expect(fetched).toBe(2);
  });

  it("lists the bundle with its flags and describes an entry", () => {
    expect(formatBundled(catalog.media()).split("\n")).toEqual([
      "beam-scan-loop  Beam Scan  video  loop       recommended",
      "hit-flash-cut   Flash Cut  video        hit",
    ]);
    expect(formatBundled([])).toContain("media:fetch");
    const described = describeBundled(flash);
    expect(described).toContain(
      "Flash Cut  (Bundled Media, video, hit)  id: hit-flash-cut",
    );
    expect(described).toContain("1920x1080, 1.2 s");
    expect(described).toContain("On the downbeat.");
  });

  it("shows a bundled item in media list with its kind, type and entry", () => {
    let document = emptyDocument("Living");
    const registry = createBuiltInRegistry(catalog);
    for (const payload of [
      { id: "m_flash", kind: "bundled", bundled: "hit-flash-cut" },
      { id: "m_gone", kind: "bundled", bundled: "beam-scan-loop" },
    ]) {
      const result = executeCommand(
        registry,
        document,
        "media.create",
        payload,
      );
      if (!result.ok) throw new Error(result.error);
      document = result.document;
    }
    const items = listMedia(
      document,
      { m_flash: { status: "ok" }, m_gone: { status: "unavailable" } },
      new Catalog({ media: [flash] }),
    );
    expect(items[0]).toMatchObject({
      kind: "bundled",
      bundled: "hit-flash-cut",
      path: null,
      type: "video",
    });
    expect(formatMedia(items).split("\n")).toEqual([
      "Flash Cut  m_flash  bundled  video  ok           hit-flash-cut",
      "Beam Scan  m_gone   bundled  ?      unavailable  beam-scan-loop",
    ]);
  });
});
