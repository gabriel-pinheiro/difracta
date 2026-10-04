import { describe, expect, it } from "vitest";

import { packs, stage } from "../media-fixtures.ts";
import {
  describePackState,
  findKnownPack,
  formatKnownPacks,
  formatPacks,
  listPacks,
} from "./packs-listing.ts";

describe("packs list", () => {
  it("lists the Bundled Pack first, then the attached ones by name, with what the runtime says of each", () => {
    const items = listPacks(stage(), packs);
    expect(items.map((item) => [item.id, item.attachment])).toEqual([
      ["bundled", "bundled"],
      ["neon-k7f3", "attached"],
      ["neon-x1y2", "attached"],
      ["tour-a9b8", "attached"],
    ]);
    expect(items.map(describePackState)).toEqual([
      "ok",
      "preparing 2/3",
      "…",
      "missing",
    ]);
    expect(formatPacks(items).split("\n")).toEqual([
      "Bundled  bundled    ok             1 entry    read-only  /opt/difracta/bundled",
      "Neon     neon-k7f3  preparing 2/3  3 entries             /media/neon",
      "Neon     neon-x1y2  …",
      "Tour     tour-a9b8  missing        0 entries             hint ../tour",
    ]);
  });

  it("adds a warning line for a scan limit or a runtime without ffmpeg", () => {
    const limited = {
      ...packs,
      "neon-k7f3": {
        ...packs["neon-k7f3"]!,
        warning: "Only the first 1000 files were taken.",
        ffmpeg: false,
      },
    };
    const lines = formatPacks(listPacks(stage(), limited)).split("\n");
    expect(lines).toContain(
      "  warning: Neon: Only the first 1000 files were taken.",
    );
    expect(lines.some((line) => line.includes("ffmpeg is not installed"))).toBe(
      true,
    );
  });
});

describe("packs known", () => {
  const known = [
    { id: "neon-k7f3", name: "Neon", folder: "/media/neon", loaded: true },
    { id: "neon-x1y2", name: "Neon", folder: "/media/neon-2", loaded: false },
    { id: "tour-a9b8", name: "Tour", folder: "/shows/tour", loaded: false },
  ];

  it("prints name, id, loaded and folder, and says how to add one when empty", () => {
    expect(formatKnownPacks(known).split("\n")).toEqual([
      "Neon  neon-k7f3  loaded  /media/neon",
      "Neon  neon-x1y2          /media/neon-2",
      "Tour  tour-a9b8          /shows/tour",
    ]);
    expect(formatKnownPacks([])).toContain("packs add <folder>");
  });

  it("finds a known Pack by id or unique name, and refuses ambiguity or an unknown one", () => {
    expect(findKnownPack(known, "tour").id).toBe("tour-a9b8");
    expect(findKnownPack(known, "neon-x1y2").folder).toBe("/media/neon-2");
    expect(() => findKnownPack(known, "Neon")).toThrow(
      "“Neon” matches 2 known Packs: Neon (neon-k7f3, /media/neon), Neon (neon-x1y2, /media/neon-2).",
    );
    expect(() => findKnownPack(known, "Nope")).toThrow(
      "knows no Pack called or identified “Nope”",
    );
  });
});
