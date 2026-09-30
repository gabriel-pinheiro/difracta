import { settings } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { cropRect } from "./live-crop.ts";
import { live } from "./live.ts";
import { context, fakeLive, shader } from "./media-fakes.ts";

const { holdSeconds, minCropSide } = settings.shares.viewer;

function showing(values: Record<string, unknown> = {}) {
  const share = fakeLive("screen");
  const player = shader(live, context({}, {}, {}, { screen: share }));
  const frame = (more: Record<string, unknown> = {}) =>
    player.frame({ media: "screen", ...values, ...more });
  /** Frames for this long, at the player's sixty a second; the last one's report. */
  const run = (seconds: number) => {
    let report = frame();
    for (let count = 1; count < Math.ceil(seconds * 60); count += 1)
      report = frame();
    return report;
  };
  return { share, frame, run };
}

describe("The crop", () => {
  it("leaves the whole picture at zero and cuts each side by its fraction", () => {
    expect(cropRect({ left: 0, top: 0, right: 0, bottom: 0 })).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
    const rect = cropRect({ left: 0.25, top: 0.1, right: 0.25, bottom: 0.4 });
    expect(rect.x).toBeCloseTo(0.25);
    expect(rect.y).toBeCloseTo(0.1);
    expect(rect.width).toBeCloseTo(0.5);
    expect(rect.height).toBeCloseTo(0.5);
  });

  it("keeps a sliver when opposite crops meet or cross, Left and Top winning", () => {
    const crossed = cropRect({ left: 0.7, top: 0.2, right: 0.6, bottom: 0.8 });
    expect(crossed.x).toBeCloseTo(0.7);
    expect(crossed.width).toBeCloseTo(minCropSide);
    expect(crossed.y).toBeCloseTo(0.2);
    expect(crossed.height).toBeCloseTo(minCropSide);
    const all = cropRect({ left: 1, top: 1, right: 1, bottom: 1 });
    expect(all.x).toBeCloseTo(1 - minCropSide);
    expect(all.width).toBeCloseTo(minCropSide);
    expect(all.x + all.width).toBeLessThanOrEqual(1);
    expect(all.y + all.height).toBeLessThanOrEqual(1);
  });
});

describe("Live", () => {
  it("is blank without a slot, where nothing views shares, and until a frame arrives", () => {
    const nowhere = shader(live, context());
    expect(nowhere.frame()).toMatchObject({ blank: true, textures: {} });
    expect(nowhere.frame({ media: "screen" })).toMatchObject({
      blank: true,
      textures: {},
    });
    const { share, frame } = showing();
    expect(frame()).toMatchObject({
      blank: true,
      textures: { media: share.handle },
    });
    expect(frame().changed).toBe(false);
    share.handle.version = 1;
    expect(frame()).toMatchObject({ blank: false, changed: true });
  });

  it("changes with each frame that arrives and not while the screen is still", () => {
    const { share, frame } = showing();
    share.handle.version = 1;
    frame();
    expect(frame().changed).toBe(false);
    expect(frame().changed).toBe(false);
    share.handle.version = 2;
    expect(frame()).toMatchObject({ blank: false, changed: true });
    expect(frame().changed).toBe(false);
    expect(frame({ fit: "contain" }).changed).toBe(true);
    expect(frame({ fit: "contain", cropLeft: 0.2 }).changed).toBe(true);
  });

  it("hands the fragment the rectangle the crops leave", () => {
    const { share, frame } = showing({
      cropLeft: 0.1,
      cropTop: 0.2,
      cropRight: 0.3,
      cropBottom: 0.4,
    });
    share.handle.version = 1;
    const { uniforms } = frame();
    const origin = uniforms.crop_origin as readonly number[];
    const size = uniforms.crop_size as readonly number[];
    expect(origin[0]).toBeCloseTo(0.1);
    expect(origin[1]).toBeCloseTo(0.2);
    expect(size[0]).toBeCloseTo(0.6);
    expect(size[1]).toBeCloseTo(0.4);
  });

  it("holds a lost picture for a while, then goes blank, and shows it again when it is back", () => {
    const { share, frame, run } = showing();
    share.handle.version = 1;
    frame();
    share.lost = true;
    expect(frame()).toMatchObject({ blank: false, changed: false });
    expect(run(holdSeconds - 0.5)).toMatchObject({
      blank: false,
      changed: false,
    });
    expect(run(1)).toMatchObject({ blank: true });
    expect(frame()).toMatchObject({ blank: true, changed: false });
    share.lost = false;
    expect(frame()).toMatchObject({ blank: false, changed: true });
    // Lost again: the wait starts over.
    share.lost = true;
    expect(run(holdSeconds - 0.5).blank).toBe(false);
  });

  it("goes blank at once on a lost picture when told to", () => {
    const { share, frame } = showing({ signalLoss: "blank" });
    share.handle.version = 1;
    expect(frame().blank).toBe(false);
    share.lost = true;
    expect(frame()).toMatchObject({ blank: true, changed: true });
    share.lost = false;
    share.handle.version = 2;
    expect(frame()).toMatchObject({ blank: false, changed: true });
  });

  it("goes blank when nobody shares any more", () => {
    const { share, frame } = showing();
    share.handle.version = 3;
    expect(frame().blank).toBe(false);
    share.handle.version = 0;
    expect(frame()).toMatchObject({ blank: true, changed: true });
  });

  it("has no Tint and no Cues", () => {
    expect(Object.keys(live.parameters)).toEqual([
      "media",
      "fit",
      "cropLeft",
      "cropTop",
      "cropRight",
      "cropBottom",
      "signalLoss",
    ]);
    expect(live.cues).toBeUndefined();
  });
});
