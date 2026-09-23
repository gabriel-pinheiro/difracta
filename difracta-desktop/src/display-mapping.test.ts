import { describe, expect, it } from "vitest";

import {
  carriedOver,
  describeDisplay,
  matchPlacements,
  redescribed,
  withoutPlacement,
  withPlacement,
  type Placement,
} from "./display-mapping.ts";
import type { ScreenDisplay } from "./screen-displays.ts";

function screen(
  key: number,
  label: string,
  x: number,
  more: Partial<ScreenDisplay> = {},
): ScreenDisplay {
  return {
    key,
    label,
    bounds: { x, y: 0, width: 1920, height: 1080 },
    scaleFactor: 1,
    primary: x === 0,
    internal: false,
    ...more,
  };
}

const on = (output: string, display: ScreenDisplay): Placement => ({
  output,
  display: describeDisplay(display),
});

/** `output → key` of the Display each placement found. */
function matched(
  placements: readonly Placement[],
  screens: readonly ScreenDisplay[],
): Record<string, number> {
  return Object.fromEntries(
    [...matchPlacements(placements, screens)].map(([key, placement]) => [
      placement.output,
      key,
    ]),
  );
}

describe("placements", () => {
  const left = describeDisplay(screen(1, "EPSON", 0));
  const right = describeDisplay(screen(2, "EPSON", 1920));

  it("keeps one Output per Display, the last shown", () => {
    const placements = withPlacement(
      withPlacement(withPlacement([], "wall", left), "floor", right),
      "ceiling",
      left,
    );
    expect(placements).toEqual([
      { output: "floor", display: right },
      { output: "ceiling", display: left },
    ]);
    expect(withoutPlacement(placements, right)).toEqual([
      { output: "ceiling", display: left },
    ]);
    // Hiding a Display that shows nothing changes nothing.
    expect(withoutPlacement([], right)).toEqual([]);
  });

  it("follows a Display whose description changes", () => {
    const moved = { ...left, bounds: { ...left.bounds, width: 1280 } };
    expect(
      redescribed([{ output: "wall", display: left }], left, moved),
    ).toEqual([{ output: "wall", display: moved }]);
  });

  it("carries to another Installation only the placements whose Output it has, its own first", () => {
    expect(
      carriedOver(
        [
          { output: "wall", display: left },
          { output: "floor", display: right },
        ],
        [{ output: "stage", display: left }],
        ["floor", "wall", "stage"],
      ),
    ).toEqual([
      { output: "floor", display: right },
      { output: "stage", display: left },
    ]);
    expect(carriedOver([{ output: "wall", display: left }], [], [])).toEqual(
      [],
    );
  });
});

describe("finding a placement's Display again", () => {
  it("tells two projectors of the same model apart by where they sit", () => {
    const a = screen(10, "EPSON", 1920);
    const b = screen(11, "EPSON", 3840);
    expect(
      matched(
        [on("floor", b), on("wall", a)],
        // After a reboot Electron numbers them anew.
        [
          screen(5, "Laptop", 0),
          screen(7, "EPSON", 3840),
          screen(6, "EPSON", 1920),
        ],
      ),
    ).toEqual({ floor: 7, wall: 6 });
  });

  it("finds a Display by its label after the Displays were rearranged, the same size first", () => {
    const projector = screen(1, "EPSON", 1920);
    expect(
      matched(
        [on("wall", projector)],
        [
          screen(2, "EPSON", 0, {
            bounds: { x: 0, y: 0, width: 1280, height: 720 },
          }),
          screen(3, "EPSON", 5000),
          screen(4, "DELL", 1920),
        ],
      ),
    ).toEqual({ wall: 3 });
  });

  it("lets the surest match choose first", () => {
    const a = screen(1, "EPSON", 1920);
    const gone = screen(2, "EPSON", 3840);
    // `gone` comes first and would take the only EPSON by label.
    expect(
      matched([on("floor", gone), on("wall", a)], [screen(9, "EPSON", 1920)]),
    ).toEqual({ wall: 9 });
  });

  it("never lands on the laptop's own Display when the projector is unplugged", () => {
    const projector = screen(1, "EPSON", 0);
    const laptop = screen(2, "Built-in", 0, { internal: true });
    expect(matched([on("wall", projector)], [laptop])).toEqual({});
    const unnamed = screen(3, "", 0);
    expect(
      matched([on("wall", unnamed)], [screen(4, "", 0, { internal: true })]),
    ).toEqual({});
    // Nor on another model that took its place.
    expect(matched([on("wall", projector)], [screen(5, "BenQ", 0)])).toEqual(
      {},
    );
  });

  it("goes by the place alone when there is no label to compare", () => {
    expect(
      matched(
        [on("wall", screen(1, "", 1920))],
        [screen(7, "", 0), screen(8, "HDMI-1", 1920)],
      ),
    ).toEqual({ wall: 8 });
  });
});
