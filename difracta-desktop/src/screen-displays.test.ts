import { describe, expect, it } from "vitest";

import { offerDisplays, type ScreenDisplay } from "./screen-displays.ts";

function screen(
  key: number,
  x: number,
  y: number,
  more: Partial<ScreenDisplay> = {},
): ScreenDisplay {
  return {
    key,
    label: "",
    bounds: { x, y, width: 1920, height: 1080 },
    scaleFactor: 1,
    primary: false,
    internal: false,
    ...more,
  };
}

describe("the Displays a Desktop offers", () => {
  it("numbers them from left to right, then top to bottom, whatever order the OS lists them in", () => {
    const offered = offerDisplays([
      screen(77, 1920, 0, { label: "EPSON PJ" }),
      screen(12, 0, 1080),
      screen(40, 0, 0, { label: "Built-in", primary: true, internal: true }),
    ]);
    expect(offered.map(({ key, display }) => [display.id, key])).toEqual([
      ["1", 40],
      ["2", 12],
      ["3", 77],
    ]);
    expect(offered[0]?.display).toEqual({
      id: "1",
      label: "Built-in",
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      scaleFactor: 1,
      primary: true,
      internal: true,
    });
  });

  it("labels a Display the OS has no name for by its id", () => {
    expect(
      offerDisplays([screen(1, 0, 0, { label: "  " }), screen(2, 1920, 0)]).map(
        ({ display }) => display.label,
      ),
    ).toEqual(["Display 1", "Display 2"]);
  });

  it("leaves out what the protocol would refuse", () => {
    expect(
      offerDisplays([
        screen(1, 0, 0, { bounds: { x: 0, y: 0, width: 0, height: 0 } }),
        screen(2, 0, 0, { label: "x".repeat(300) }),
      ]).map(({ display }) => [display.id, display.label.length]),
    ).toEqual([["1", 200]]);
  });
});
