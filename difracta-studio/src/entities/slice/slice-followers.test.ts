import type { Surface, Table } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { followersOf, pastDisplay } from "./slice-followers";

const surfaces = {
  logo: {
    id: "logo",
    order: "a0",
    mappings: { led: { follow: { slice: "center" } } },
  },
  stage: {
    id: "stage",
    order: "a1",
    mappings: { led: { follow: { frame: true } } },
  },
  wall: { id: "wall", order: "a2", mappings: { led: {} } },
  other: {
    id: "other",
    order: "a3",
    mappings: { tv: { follow: { slice: "center" } } },
  },
} as unknown as Table<Surface>;

describe("followersOf", () => {
  it("lists the Surfaces following the Slice on its own Output", () => {
    expect(
      followersOf(surfaces, { id: "center", outputId: "led" }).map((s) => s.id),
    ).toEqual(["logo"]);
  });
});

describe("pastDisplay", () => {
  it("says when a rectangle reaches past the Display Frame", () => {
    const size = { width: 100, height: 50 };
    expect(pastDisplay({ x: 0, y: 0, width: 100, height: 50 }, size)).toBe(
      false,
    );
    expect(pastDisplay({ x: 1, y: 0, width: 100, height: 50 }, size)).toBe(
      true,
    );
    expect(pastDisplay({ x: 1, y: 0, width: 100, height: 50 }, null)).toBe(
      false,
    );
  });
});
