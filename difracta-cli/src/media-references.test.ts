import { emptyDocument } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { packs, stage } from "./media-fixtures.ts";

import {
  entryOf,
  resolveMediaReference,
  resolvePackId,
} from "./media-references.ts";

describe("resolvePackId", () => {
  it("takes an id as it is, the Bundled Pack included", () => {
    expect(resolvePackId(stage(), packs, "neon-k7f3")).toBe("neon-k7f3");
    expect(resolvePackId(stage(), packs, "bundled")).toBe("bundled");
    expect(resolvePackId(emptyDocument("x"), {}, "bundled")).toBe("bundled");
  });

  it("finds a Pack by name ignoring case, from the live slice or the Installation", () => {
    expect(resolvePackId(stage(), packs, "tour")).toBe("tour-a9b8");
    expect(resolvePackId(stage(), packs, "BUNDLED")).toBe("bundled");
    expect(resolvePackId(emptyDocument("x"), {}, "Bundled")).toBe("bundled");
  });

  it("refuses an ambiguous name listing each Pack with its id", () => {
    expect(() => resolvePackId(stage(), packs, "Neon")).toThrow(
      "“Neon” matches 2 Packs: Neon (neon-k7f3), Neon (neon-x1y2).",
    );
  });

  it("refuses an unknown Pack pointing at packs list and packs known", () => {
    expect(() => resolvePackId(stage(), packs, "Nope")).toThrow(
      "No Pack is called or identified “Nope”",
    );
  });
});

describe("resolveMediaReference", () => {
  it("keeps ids, none and anything without a slash", () => {
    expect(resolveMediaReference(stage(), packs, "neon-k7f3/tunnels-04")).toBe(
      "neon-k7f3/tunnels-04",
    );
    expect(resolveMediaReference(stage(), packs, "")).toBe("");
    expect(resolveMediaReference(stage(), packs, "share_1")).toBe("share_1");
  });

  it("resolves the Pack by name and the entry by its path, with or without extension, ignoring case", () => {
    expect(
      resolveMediaReference(
        stage(),
        packs,
        "bundled/clips/beam-scan-loop.webm",
      ),
    ).toBe("bundled/beam-scan-loop");
    expect(
      resolveMediaReference(stage(), packs, "Bundled/clips/beam-scan-loop"),
    ).toBe("bundled/beam-scan-loop");
    expect(resolveMediaReference(stage(), packs, "neon-k7f3/LOGO.png")).toBe(
      "neon-k7f3/logo",
    );
  });

  it("refuses an ambiguous path naming the candidates", () => {
    expect(() =>
      resolveMediaReference(stage(), packs, "neon-k7f3/tunnels/04"),
    ).toThrow(
      "“tunnels/04” matches 2 entries of Pack Neon (neon-k7f3): tunnels/04.mp4 (tunnels-04), Tunnels/04.MP4 (tunnels-04-2).",
    );
  });

  it("refuses an unknown entry pointing at media list", () => {
    expect(() =>
      resolveMediaReference(stage(), packs, "Bundled/nothing.mp4"),
    ).toThrow(
      "No entry of Pack Bundled (bundled) is identified “nothing.mp4” or has that path; `difracta media list bundled` lists them.",
    );
  });

  it("keeps a well-formed reference into a Pack not loaded here, and refuses a path there", () => {
    expect(resolveMediaReference(stage(), packs, "Tour/opening")).toBe(
      "tour-a9b8/opening",
    );
    expect(resolveMediaReference(stage(), packs, "neon-x1y2/clip-1")).toBe(
      "neon-x1y2/clip-1",
    );
    expect(() =>
      resolveMediaReference(stage(), packs, "Tour/clips/opening.mp4"),
    ).toThrow("is not loaded here");
  });
});

describe("entryOf", () => {
  it("finds the loaded entry a reference names", () => {
    expect(entryOf(packs, "bundled/beam-scan-loop").entry.name).toBe(
      "Beam Scan",
    );
  });

  it("names the unknown half", () => {
    expect(() => entryOf(packs, "bundled/none")).toThrow(
      "Pack Bundled (bundled) has no entry “none”",
    );
    expect(() => entryOf(packs, "gone-0000/x")).toThrow(
      "Pack “gone-0000” is not loaded by this runtime",
    );
    expect(() => entryOf(packs, "not a reference")).toThrow(
      "is not a Pack entry reference",
    );
  });
});
