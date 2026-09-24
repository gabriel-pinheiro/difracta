import { describe, expect, it } from "vitest";

import { firedDetail } from "./address.ts";

describe("firedDetail", () => {
  it("says nothing for a Cue or a Scene", () => {
    expect(
      firedDetail({
        address: "scene/s/play",
        typed: "scene/Live/play",
        ok: true,
        warnings: [],
      }),
    ).toBe("");
  });

  it("counts a Macro's actions and skips in All", () => {
    expect(
      firedDetail({
        address: "macro/m/run",
        typed: "macro/Hit/run",
        ok: true,
        actions: 1,
        warnings: [],
      }),
    ).toBe(" (1 action)");
    expect(
      firedDetail({
        address: "macro/m/run",
        typed: "macro/Hit/run",
        ok: true,
        actions: 5,
        warnings: ["Hit: gone"],
      }),
    ).toBe(" (5 actions, 1 skipped)");
  });

  it("adds what another Run Mode picked and fired", () => {
    const base = {
      address: "macro/m/run",
      typed: "macro/Shimmer/run",
      ok: true,
      actions: 12,
    };
    expect(
      firedDetail({
        ...base,
        mode: "some",
        picked: 3,
        fired: 2,
        warnings: ["x"],
      }),
    ).toBe(" (12 actions, some 3: 3 picked, 2 fired, 1 skipped)");
    expect(
      firedDetail({ ...base, mode: "one", picked: 1, fired: 0, warnings: [] }),
    ).toBe(" (12 actions, one: 1 picked, 0 fired)");
    expect(
      firedDetail({
        ...base,
        mode: "sequence",
        picked: 1,
        fired: 1,
        warnings: [],
      }),
    ).toBe(" (12 actions, sequence: 1 picked, 1 fired)");
  });
});
