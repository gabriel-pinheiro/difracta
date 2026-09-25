import {
  NO_MEDIA,
  createRandom,
  createVisualPlayer,
  recordingContext,
  resolveParameters,
  type CanvasVisual,
  type RecordedCall,
} from "@difracta/render/sdk";
import { describe, expect, it } from "vitest";

import { bubbles } from "./bubbles.ts";
import { koiPond } from "./koi-pond.ts";
import { solidColor } from "./solid-color.ts";

const WIDTH = 320;
const HEIGHT = 180;
const DT = 1 / 60;

/** Steps a Visual directly and reads back where it drew, via one method's first two arguments. */
function harness(visual: CanvasVisual, positionMethod: string) {
  const recording = recordingContext();
  let params = resolveParameters(visual.parameters, {});
  const instance = visual.create({
    width: WIDTH,
    height: HEIGHT,
    params,
    paths: {},
    random: createRandom("test"),
    media: NO_MEDIA,
  });
  const step = (
    frames: number,
    values: Record<string, unknown> = {},
    dt = DT,
  ) => {
    params = resolveParameters(visual.parameters, {
      ...params,
      ...(values as typeof params),
    });
    for (let i = 0; i < frames; i += 1)
      instance.update({
        dt,
        params,
        paths: {},
        width: WIDTH,
        height: HEIGHT,
        changed: i === 0,
      });
  };
  const positions = (): readonly (readonly [number, number])[] => {
    recording.clear();
    instance.render({
      context: recording.context,
      width: WIDTH,
      height: HEIGHT,
      params,
      paths: {},
    });
    return recording
      .callsTo(positionMethod)
      .map((call: RecordedCall) => [
        Number(call.args[0]),
        Number(call.args[1]),
      ]);
  };
  return { step, positions };
}

function distance(
  a: readonly [number, number],
  b: readonly [number, number],
): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

describe.each([
  {
    name: "Koi Pond",
    visual: koiPond,
    method: "translate",
    count: 7,
    wraps: () => false,
  },
  {
    name: "Bubbles",
    visual: bubbles,
    method: "ellipse",
    count: 50,
    // A bubble that reached the top starts over at the bottom.
    wraps: (from: readonly [number, number], to: readonly [number, number]) =>
      to[1] > from[1] + HEIGHT / 2,
  },
])("$name", ({ visual, method, count, wraps }) => {
  it("keeps every entity in place when the count grows or shrinks", () => {
    const { step, positions } = harness(visual, method);
    step(30);
    const before = positions();
    expect(before).toHaveLength(count);
    step(1, { count: count + 3 }, 0);
    const grown = positions();
    expect(grown).toHaveLength(count + 3);
    expect(grown.slice(0, count)).toEqual(before);
    step(1, { count: count - 2 }, 0);
    expect(positions()).toEqual(before.slice(0, count - 2));
  });

  it("moves on smoothly through a speed change", () => {
    const { step, positions } = harness(visual, method);
    step(30);
    const slow = positions();
    step(1, { speed: 3 });
    const fast = positions();
    for (let i = 0; i < count; i += 1) {
      if (wraps(slow[i]!, fast[i]!)) continue;
      const moved = distance(slow[i]!, fast[i]!);
      expect(moved).toBeLessThan(WIDTH * 0.03);
    }
    // And a frame at the new speed does move things.
    expect(slow.some((at, i) => distance(at, fast[i]!) > 0)).toBe(true);
  });
});

describe("Solid Color", () => {
  it("draws once per color and disappears at alpha zero", () => {
    const recording = recordingContext();
    const player = createVisualPlayer(solidColor, {
      context: recording.context,
      width: WIDTH,
      height: HEIGHT,
      seed: "layer",
    });
    expect(player.frame(DT, {}).rendered).toBe(true);
    expect(player.frame(DT, {}).rendered).toBe(false);
    expect(player.frame(DT, { color: [0, 0.5, 1, 1] }).rendered).toBe(true);
    expect(recording.callsTo("fillRect")).toHaveLength(2);
    expect(player.frame(DT, { color: [0, 0.5, 1, 0] })).toEqual({
      rendered: false,
      blank: true,
    });
    expect(player.frame(DT, { color: [0, 0.5, 1, 0.5] }).rendered).toBe(true);
  });
});
