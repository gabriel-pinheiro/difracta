import { emptyDocument, settings, type Document } from "@difracta/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FrameCanvas } from "./frame-canvas.ts";

// No GPU here: the compositor is a stub that records its calls, and the
// animation frame is a queue the test drains by hand.
const mocks = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock("@difracta/render", () => ({
  createCompositor: () => ({
    render: mocks.render,
    trigger: () => undefined,
    dispose: () => undefined,
  }),
}));
vi.mock("@difracta/visuals", () => ({ builtInCatalog: {} }));

const frames: FrameRequestCallback[] = [];
let now = 0;

/** Runs every pending animation frame once. */
function flush(): void {
  now += 16;
  for (const frame of frames.splice(0)) frame(now);
}

const report = {
  drew: true,
  layers: { planned: 0, running: 0, rendered: 0 },
  shaders: { planned: 0, running: 0, rendered: 0 },
  filters: { planned: 0, running: 0, executed: 0 },
  issues: [],
};

function blackout(document: Document, value: boolean): Document {
  return {
    ...document,
    operational: { ...document.operational, blackout: value },
  };
}

describe("FrameCanvas", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    frames.length = 0;
    mocks.render.mockReset().mockReturnValue(report);
    vi.stubGlobal("requestAnimationFrame", (frame: FrameRequestCallback) => {
      frames.push(frame);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    vi.stubGlobal("window", {
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (id: number) => clearTimeout(id),
      devicePixelRatio: 1,
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("idles without a document or under Blackout, and wakes on the next document", () => {
    const canvas = { width: 0, height: 0, clientWidth: 100, clientHeight: 50 };
    const frame = new FrameCanvas(canvas as unknown as HTMLCanvasElement, {});
    frame.start();
    expect(frames).toHaveLength(1);
    // Without a document the tick pauses for the idle interval.
    flush();
    expect(frames).toHaveLength(0);
    vi.advanceTimersByTime(settings.output.idleFrameMs - 1);
    expect(frames).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(frames).toHaveLength(1);
    // Under Blackout the frame is drawn, then the loop idles again.
    const dark = blackout(emptyDocument("Test"), true);
    frame.update({ document: dark, outputId: "out_a" });
    flush();
    expect(mocks.render).toHaveBeenCalledTimes(1);
    expect(frames).toHaveLength(0);
    // Releasing Blackout wakes the loop at once instead of at the interval.
    frame.update({ document: blackout(dark, false), outputId: "out_a" });
    expect(frames).toHaveLength(1);
    vi.advanceTimersByTime(settings.output.idleFrameMs);
    expect(frames).toHaveLength(1);
    flush();
    expect(mocks.render).toHaveBeenCalledTimes(2);
    // Drawing again: the next tick is an animation frame, not a pause.
    expect(frames).toHaveLength(1);
    frame.stop();
    expect(frame.metrics().frameIntervalMs).toBeNull();
  });
});
