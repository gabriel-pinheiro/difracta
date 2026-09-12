import { describe, expect, it } from "vitest";

import { passesWithInput, type FilterPass } from "./filter-players.ts";

const pass = (below: number): FilterPass =>
  ({ draw: { below } }) as unknown as FilterPass;
const frame = (index: number) => ({ index });

describe("passesWithInput", () => {
  it("runs a pass only when a Layer below it drew this frame", () => {
    const passes = [pass(1), pass(2), pass(3)];
    // Nothing drew: no pass, so the chain is never begun.
    expect(passesWithInput(passes, [])).toEqual([]);
    // Only the second Layer drew: the pass right above the first is skipped.
    expect(passesWithInput(passes, [frame(1), frame(2)])).toEqual([
      pass(2),
      pass(3),
    ]);
    expect(passesWithInput(passes, [frame(0)])).toEqual(passes);
    expect(passesWithInput(passes, [frame(2)])).toEqual([pass(3)]);
  });
});
