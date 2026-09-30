import { settings } from "@difracta/core";
import type { ShareEndReason } from "@difracta/protocol";
import { describe, expect, it } from "vitest";

import { fakeCaptured, fakeSending, settle } from "./share-fakes";
import { CAPTURE_ENDED, Sharer, type SharingClient } from "./sharer";

function fakeClient() {
  const calls: string[] = [];
  const signals: { mediaId: string; viewerId: string; payload: unknown }[] = [];
  const viewer = new Set<Parameters<SharingClient["onViewer"]>[0]>();
  const signal = new Set<Parameters<SharingClient["onSignal"]>[0]>();
  const ended = new Set<Parameters<SharingClient["onEnded"]>[0]>();
  const listen =
    <T>(listeners: Set<T>) =>
    (listener: T) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    };
  const client: SharingClient = {
    share: (mediaId, declaration) =>
      calls.push(`share ${mediaId} ${JSON.stringify(declaration)}`),
    stop: (mediaId) => calls.push(`stop ${mediaId}`),
    signal: (mediaId, viewerId, payload) =>
      signals.push({ mediaId, viewerId, payload }) > 0,
    onViewer: listen(viewer),
    onSignal: listen(signal),
    onEnded: listen(ended),
  };
  return {
    client,
    calls,
    signals,
    listeners: () => viewer.size + signal.size + ended.size,
    /** The runtime announces a Viewer, or says it left. */
    viewer(mediaId: string, viewerId: string, joined = true): void {
      for (const listener of viewer) listener({ mediaId, viewerId, joined });
    },
    deliver(mediaId: string, viewerId: string, payload: unknown): void {
      for (const listener of signal) listener(mediaId, viewerId, payload);
    },
    end(mediaId: string, reason: ShareEndReason, message: string): void {
      for (const listener of ended) listener({ mediaId, reason, message });
    },
  };
}

function sharing() {
  const runtime = fakeClient();
  const page = fakeSending();
  const sharer = new Sharer({
    client: runtime.client,
    name: "laptop",
    sending: page.context,
  });
  return { runtime, page, sharer };
}

const sharp = { quality: "sharp", cursor: false } as const;

describe("This computer as a Sharer", () => {
  it("declares a share with its name and a screen or a window, and nothing else", () => {
    const { runtime, sharer } = sharing();
    const screen = fakeCaptured(1920, 1080, "monitor");
    sharer.start("m_wall", screen.captured, sharp);
    sharer.start("m_side", fakeCaptured(800, 600, "window").captured, {
      quality: "smooth",
      cursor: true,
    });
    expect(runtime.calls).toEqual([
      'share m_wall {"sharer":"laptop","source":"screen"}',
      'share m_side {"sharer":"laptop","source":"window"}',
    ]);
    expect(screen.track.contentHint).toBe(
      settings.shares.sharer.qualities.sharp.contentHint,
    );
    expect(sharer.shares.get()).toMatchObject([
      { mediaId: "m_wall", source: "screen", quality: "sharp", cursor: false },
      { mediaId: "m_side", source: "window", quality: "smooth", cursor: true },
    ]);
  });

  it("says whether the cursor is in the picture as the capture has it, not as it was asked", () => {
    const { sharer } = sharing();
    sharer.start(
      "m_drawn",
      fakeCaptured(1280, 720, "monitor", "always").captured,
      { quality: "sharp", cursor: false },
    );
    sharer.start(
      "m_hidden",
      fakeCaptured(1280, 720, "monitor", "never").captured,
      { quality: "sharp", cursor: false },
    );
    sharer.start("m_silent", fakeCaptured().captured, {
      quality: "sharp",
      cursor: true,
    });
    expect(
      sharer.shares.get().map((share) => [share.cursor, share.cursorShown]),
    ).toEqual([
      [false, true],
      [false, false],
      [true, true],
    ]);
  });

  it("offers to each Viewer of a slot over that slot's share", async () => {
    const { runtime, page, sharer } = sharing();
    sharer.start("m_wall", fakeCaptured().captured, sharp);
    sharer.start("m_side", fakeCaptured().captured, sharp);
    runtime.viewer("m_side", "v1");
    runtime.viewer("m_nowhere", "v9");
    await settle();
    expect(runtime.signals).toMatchObject([
      { mediaId: "m_side", viewerId: "v1", payload: { type: "offer" } },
    ]);
    page.peer().reach("connected");
    expect(sharer.shares.get()).toMatchObject([
      { mediaId: "m_wall", offered: 0, connected: 0 },
      { mediaId: "m_side", offered: 1, connected: 1 },
    ]);
    runtime.deliver("m_side", "v1", {
      type: "answer",
      connection: "c1",
      sdp: "answer-sdp",
    });
    await settle();
    expect(page.peer().calls).toContain("remote answer-sdp");
    runtime.viewer("m_side", "v1", false);
    expect(page.peer().closed).toBe(true);
    expect(sharer.shares.get()[1]).toMatchObject({ offered: 0 });
  });

  it("stops a share: the capture, its connections, and the runtime is told", async () => {
    const { runtime, page, sharer } = sharing();
    const shared = fakeCaptured();
    sharer.start("m_wall", shared.captured, sharp);
    runtime.viewer("m_wall", "v1");
    await settle();
    sharer.stop("m_wall");
    expect(shared.stopped()).toBe(true);
    expect(page.peer().closed).toBe(true);
    expect(runtime.calls.at(-1)).toBe("stop m_wall");
    expect(sharer.shares.get()).toEqual([]);
    expect(sharer.ended.get()).toEqual([]);
    sharer.stop("m_wall");
    expect(runtime.calls.filter((call) => call === "stop m_wall")).toHaveLength(
      1,
    );
  });

  it("stops the share whose window closed, and says so", () => {
    const { runtime, sharer } = sharing();
    const shared = fakeCaptured(800, 600, "window");
    sharer.start("m_wall", shared.captured, sharp);
    shared.end();
    expect(runtime.calls.at(-1)).toBe("stop m_wall");
    expect(sharer.shares.get()).toEqual([]);
    expect(sharer.ended.get()).toEqual([
      { mediaId: "m_wall", message: CAPTURE_ENDED },
    ]);
  });

  it("ends a share the runtime ended, in the runtime's words, without stopping it again", () => {
    const { runtime, sharer } = sharing();
    const shared = fakeCaptured();
    sharer.start("m_wall", shared.captured, sharp);
    runtime.end("m_wall", "replaced", "booth shares into “Wall” now.");
    expect(shared.stopped()).toBe(true);
    expect(sharer.shares.get()).toEqual([]);
    expect(sharer.ended.get()).toEqual([
      { mediaId: "m_wall", message: "booth shares into “Wall” now." },
    ]);
    expect(runtime.calls.some((call) => call.startsWith("stop"))).toBe(false);
    // Nothing of a share that is not this computer's.
    runtime.end("m_side", "stopped", "Stopped.");
    expect(sharer.ended.get()).toHaveLength(1);
    sharer.dismiss("m_wall");
    expect(sharer.ended.get()).toEqual([]);
  });

  it("takes the place of its own share of a slot as a new one", async () => {
    const { runtime, page, sharer } = sharing();
    const first = fakeCaptured();
    sharer.start("m_wall", first.captured, sharp);
    runtime.viewer("m_wall", "v1");
    await settle();
    runtime.end("m_wall", "stopped", "Stopped by another client.");
    sharer.start("m_wall", fakeCaptured().captured, sharp);
    expect(sharer.ended.get()).toEqual([]);
    sharer.start("m_wall", fakeCaptured(640, 480, "window").captured, {
      quality: "smooth",
      cursor: false,
    });
    expect(first.stopped()).toBe(true);
    expect(page.peer().closed).toBe(true);
    expect(runtime.calls.slice(-3)).toEqual([
      'share m_wall {"sharer":"laptop","source":"screen"}',
      "stop m_wall",
      'share m_wall {"sharer":"laptop","source":"window"}',
    ]);
    expect(sharer.shares.get()).toMatchObject([
      { mediaId: "m_wall", source: "window", quality: "smooth" },
    ]);
  });

  it("stops everything and hears nothing more once disposed", () => {
    const { runtime, sharer } = sharing();
    sharer.start("m_wall", fakeCaptured().captured, sharp);
    sharer.start("m_side", fakeCaptured().captured, sharp);
    sharer.dispose();
    expect(runtime.calls.slice(-2)).toEqual(["stop m_wall", "stop m_side"]);
    expect(sharer.shares.get()).toEqual([]);
    expect(runtime.listeners()).toBe(0);
  });
});
