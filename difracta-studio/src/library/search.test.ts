import type { VisualDefinition } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { isSubsequence, matchTier, rankDefinitions } from "./search.ts";

function visual(
  id: string,
  name: string,
  description: string,
  extra: Partial<VisualDefinition> = {},
): VisualDefinition {
  return {
    kind: "visual",
    id,
    name,
    description,
    backend: "canvas",
    parameters: {},
    ...extra,
  };
}

const catalog = [
  visual("plasma", "Plasma", "Flowing color.", { backend: "shader" }),
  visual("stars", "Drifting Stars", "Points of light.", { recommended: true }),
  visual("solid", "Solid Color", "One flat color.", { recommended: true }),
  visual("runner", "Path Runner", "A streak along a Path.", {
    paths: [{ key: "track", label: "Track" }],
    cues: [{ key: "launch", label: "Launch" }],
  }),
  visual("grid", "Grid Pulse", "Cells lighting up.", {
    backend: "shader",
    cues: [{ key: "pulse", label: "Pulse" }],
  }),
];

const ids = (list: readonly VisualDefinition[]): string[] =>
  list.map((entry) => entry.id);

describe("library search", () => {
  it("puts recommended first, then names, without a query", () => {
    expect(ids(rankDefinitions(catalog, ""))).toEqual([
      "stars",
      "solid",
      "grid",
      "runner",
      "plasma",
    ]);
  });

  it("ranks name prefix, word prefix, then letters in order, before description matches", () => {
    expect(matchTier("pl", "Plasma")).toBe(0);
    expect(matchTier("st", "Drifting Stars")).toBe(1);
    expect(matchTier("dst", "Drifting Stars")).toBe(2);
    expect(matchTier("zz", "Drifting Stars")).toBeUndefined();
    expect(isSubsequence("gp", "grid pulse")).toBe(true);
    expect(matchTier("dst", "Drifting Stars", false)).toBeUndefined();
    // Letters in order count on names only: "grd" is Grid Pulse, not every description.
    expect(ids(rankDefinitions(catalog, "grd"))).toEqual(["grid"]);
    // "color" is a word of one name and appears in two descriptions.
    expect(ids(rankDefinitions(catalog, "color"))).toEqual(["solid", "plasma"]);
    // "p": Plasma and Path Runner by prefix, Grid Pulse by word, Points of light by description.
    expect(ids(rankDefinitions(catalog, "p"))).toEqual([
      "runner",
      "plasma",
      "grid",
      "stars",
    ]);
  });

  it("narrows by facets, combined with the query", () => {
    expect(
      ids(
        rankDefinitions(catalog, "", {
          backend: "shader",
          path: "any",
          cues: "any",
        }),
      ),
    ).toEqual(["grid", "plasma"]);
    expect(
      ids(
        rankDefinitions(catalog, "", {
          backend: "any",
          path: "uses",
          cues: "any",
        }),
      ),
    ).toEqual(["runner"]);
    expect(
      ids(
        rankDefinitions(catalog, "", {
          backend: "any",
          path: "none",
          cues: "has",
        }),
      ),
    ).toEqual(["grid"]);
    expect(
      ids(
        rankDefinitions(catalog, "grid", {
          backend: "canvas",
          path: "any",
          cues: "any",
        }),
      ),
    ).toEqual([]);
  });
});
