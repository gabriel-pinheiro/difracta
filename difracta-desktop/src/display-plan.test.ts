import { describe, expect, it } from "vitest";

import { describeDisplay, type Placement } from "./display-mapping.ts";
import {
  planDisplays,
  showingReport,
  windowChanges,
  type DisplayWindowState,
} from "./display-plan.ts";
import { offerDisplays, type ScreenDisplay } from "./screen-displays.ts";

function screen(key: number, label: string, x: number): ScreenDisplay {
  return {
    key,
    label,
    bounds: { x, y: 0, width: 1920, height: 1080 },
    scaleFactor: 1,
    primary: x === 0,
    internal: false,
  };
}

const laptop = screen(1, "Laptop", 0);
const projector = screen(2, "EPSON", 1920);
const placed = (output: string, display: ScreenDisplay): Placement => ({
  output,
  display: describeDisplay(display),
});
const open = (output: string, display: ScreenDisplay): DisplayWindowState => ({
  key: display.key,
  ...placed(output, display),
});

describe("which Display windows should be open", () => {
  it("opens one per placement whose Display is connected and whose Output exists", () => {
    const placements = [placed("wall", projector), placed("gone", laptop)];
    expect(planDisplays(placements, [laptop, projector], ["wall"])).toEqual({
      placements,
      windows: [open("wall", projector)],
    });
  });

  it("keeps the placement of an unplugged Display, and lights it when it is back", () => {
    const placements = [placed("wall", projector)];
    const unplugged = planDisplays(placements, [laptop], ["wall"]);
    expect(unplugged).toEqual({ placements, windows: [] });
    // Back under another key, as Electron numbers it anew.
    const back = screen(9, "EPSON", 1920);
    expect(
      planDisplays(unplugged.placements, [laptop, back], ["wall"]).windows,
    ).toEqual([open("wall", back)]);
  });

  it("describes a placement as its Display is now", () => {
    const moved = screen(2, "EPSON", -1920);
    expect(
      planDisplays([placed("wall", projector)], [laptop, moved], ["wall"]),
    ).toEqual({
      placements: [placed("wall", moved)],
      windows: [open("wall", moved)],
    });
  });
});

describe("the way from the open windows to the wanted ones", () => {
  it("opens, closes, and loads another Output into a window that stays", () => {
    expect(
      windowChanges(
        [open("wall", projector), open("floor", laptop)],
        [open("ceiling", projector)],
      ),
    ).toEqual({ close: [1], load: [open("ceiling", projector)], open: [] });
    expect(windowChanges([], [open("wall", projector)])).toEqual({
      close: [],
      load: [],
      open: [open("wall", projector)],
    });
    expect(
      windowChanges([open("wall", projector)], [open("wall", projector)]),
    ).toEqual({ close: [], load: [], open: [] });
  });

  it("opens a new window for a Display whose bounds changed under it", () => {
    const smaller = {
      ...projector,
      bounds: { ...projector.bounds, width: 1280, height: 720 },
    };
    expect(
      windowChanges([open("wall", projector)], [open("wall", smaller)]),
    ).toEqual({ close: [2], load: [], open: [open("wall", smaller)] });
  });
});

describe("what the runtime is told each Display shows", () => {
  it("uses the offered ids, and leaves out a window whose Display is gone", () => {
    expect(
      showingReport(
        [open("wall", projector), open("floor", screen(5, "Gone", 9000))],
        offerDisplays([projector, laptop]),
      ),
    ).toEqual({ "2": "wall" });
  });
});
