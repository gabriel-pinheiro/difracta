import { applyPatches, type Document, type Patch } from "@difracta/core";
import type { ServerMessage, ShareDeclaration } from "@difracta/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScreenShares, type ShareClient } from "./screen-shares.ts";

const laptop: ShareDeclaration = { sharer: "Laptop", source: "window" };
const booth: ShareDeclaration = { sharer: "Booth", source: "screen" };

const desktop = (id: string, actor = id): ShareClient => ({
  id,
  kind: "desktop",
  actor,
});
const output = (id: string): ShareClient => ({ id, kind: "output", actor: id });

function withMedia(media: Document["media"]): Pick<Document, "media"> {
  return { media };
}

const slides = {
  m_slides: {
    id: "m_slides",
    kind: "share",
    name: "Slides",
    parentId: null,
    order: "a0",
  },
  m_logo: {
    id: "m_logo",
    kind: "file",
    name: "Logo",
    parentId: null,
    order: "a1",
    path: "logo.png",
  },
} as unknown as Document["media"];

/** A ScreenShares over a document that holds Slides, with every message and patch kept. */
function setup(options: { maxViewers?: number } = {}) {
  let document: Pick<Document, "media"> | undefined = withMedia(slides);
  const sent: [string, ServerMessage][] = [];
  const patches: Patch[] = [];
  let live: { media: Record<string, unknown> } = { media: {} };
  const follow = (emitted: readonly Patch[]): void => {
    live = applyPatches(live, emitted);
  };
  const shares = new ScreenShares({
    document: () => document,
    send: (sessionId, message) => sent.push([sessionId, message]) > 0,
    now: () => 1_000,
    interruptedForMs: 5_000,
    ...options,
  });
  shares.onChange((emitted) => {
    patches.push(...emitted);
    follow(emitted);
  });
  shares.reconcile();
  return {
    shares,
    sent,
    patches,
    /** Messages to one connection, taken. */
    to: (sessionId: string): ServerMessage[] => {
      const mine = sent.filter(([id]) => id === sessionId).map(([, m]) => m);
      for (let i = sent.length - 1; i >= 0; i -= 1)
        if (sent[i]?.[0] === sessionId) sent.splice(i, 1);
      return mine;
    },
    slot: () => live.media.m_slides,
    setDocument: (next: Pick<Document, "media"> | undefined): void => {
      document = next;
      shares.reconcile();
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Screen Shares in the runtime", () => {
  it("starts each slot idle and takes a declaration from a desktop connection only", () => {
    const { shares, to, slot } = setup();
    expect(shares.state()).toEqual({ m_slides: { status: "idle" } });
    shares.declare(output("o1"), "m_slides", laptop, false);
    expect(to("o1")).toEqual([
      {
        type: "share-ended",
        mediaId: "m_slides",
        reason: "refused",
        message:
          "Only a connection of kind “desktop” can share into a Screen Share; this one is “output”.",
      },
    ]);
    shares.declare(desktop("d1"), "m_logo", laptop, false);
    shares.declare(desktop("d1"), "m_gone", laptop, false);
    expect(to("d1").map((m) => m.type === "share-ended" && m.message)).toEqual([
      "“Logo” is not a Screen Share; only a Media item of kind share can be shared into.",
      "No Screen Share “m_gone” in the open Installation.",
    ]);
    shares.declare(desktop("d1"), "m_slides", laptop, false);
    expect(slot()).toEqual({
      status: "live",
      sharer: "Laptop",
      source: "window",
      since: 1_000,
      viewers: 0,
    });
  });

  it("refuses a declaration when no Installation is open", () => {
    const { shares, to, setDocument } = setup();
    setDocument(undefined);
    expect(shares.state()).toEqual({});
    shares.declare(desktop("d1"), "m_slides", laptop, false);
    expect(to("d1")).toEqual([
      {
        type: "share-ended",
        mediaId: "m_slides",
        reason: "refused",
        message: "No Installation is open.",
      },
    ]);
  });

  it("updates a declaration per property and stops on null", () => {
    const { shares, patches, to, slot } = setup();
    shares.declare(desktop("d1"), "m_slides", laptop, false);
    patches.length = 0;
    shares.declare(desktop("d1"), "m_slides", laptop, false);
    shares.declare(
      desktop("d1"),
      "m_slides",
      { ...laptop, source: "screen" },
      false,
    );
    expect(patches).toEqual([
      { op: "set", path: ["media", "m_slides", "source"], value: "screen" },
    ]);
    shares.declare(desktop("d2"), "m_slides", null, false);
    expect(slot()).toMatchObject({ status: "live" });
    shares.declare(desktop("d1"), "m_slides", null, false);
    expect(slot()).toEqual({ status: "idle" });
    expect(to("d1")).toEqual([]);
  });

  it("lets a Viewer wait for a Sharer, announces it, and relays both ways unread", () => {
    const { shares, to, slot } = setup();
    shares.view(output("v1"), "m_slides", true);
    expect(to("v1")).toEqual([
      {
        type: "share-viewing",
        mediaId: "m_slides",
        viewing: { status: "idle" },
      },
    ]);
    shares.declare(desktop("d1"), "m_slides", laptop, false);
    const [viewing] = to("v1");
    expect(viewing).toMatchObject({ viewing: { status: "live" } });
    expect(to("d1")).toEqual([
      {
        type: "share-viewer",
        mediaId: "m_slides",
        viewerId: "v1",
        joined: true,
      },
    ]);
    shares.view(output("v2"), "m_slides", true);
    expect(to("d1")).toEqual([
      {
        type: "share-viewer",
        mediaId: "m_slides",
        viewerId: "v2",
        joined: true,
      },
    ]);
    expect(slot()).toMatchObject({ viewers: 2 });
    const offer = { sdp: "v=0 offer", nested: [1, { two: 2 }] };
    shares.receive(desktop("d1"), {
      type: "share-signal",
      mediaId: "m_slides",
      viewerId: "v2",
      payload: offer,
    });
    shares.receive(output("v1"), {
      type: "share-signal",
      mediaId: "m_slides",
      payload: { candidate: "c1" },
    });
    // Only the Sharer talks to Viewers, only to its own, and only a Viewer to the Sharer.
    shares.receive(output("v1"), {
      type: "share-signal",
      mediaId: "m_slides",
      viewerId: "v2",
      payload: "forged",
    });
    shares.receive(output("x"), {
      type: "share-signal",
      mediaId: "m_slides",
      payload: "stranger",
    });
    expect(to("v2")).toEqual([
      expect.objectContaining({ type: "share-viewing" }),
      { type: "share-signal", mediaId: "m_slides", payload: offer },
    ]);
    expect(to("v1")).toEqual([]);
    expect(to("d1")).toEqual([
      {
        type: "share-signal",
        mediaId: "m_slides",
        viewerId: "v1",
        payload: { candidate: "c1" },
      },
    ]);
    // Viewing again asks for a new offer; leaving is announced.
    shares.view(output("v1"), "m_slides", true);
    shares.view(output("v1"), "m_slides", false);
    expect(to("d1")).toEqual([
      {
        type: "share-viewer",
        mediaId: "m_slides",
        viewerId: "v1",
        joined: true,
      },
      {
        type: "share-viewer",
        mediaId: "m_slides",
        viewerId: "v1",
        joined: false,
      },
    ]);
    expect(slot()).toMatchObject({ viewers: 1 });
  });

  it("refuses a Viewer past the cap, and one of a slot that is not there", () => {
    const { shares, to } = setup({ maxViewers: 2 });
    shares.view(output("v1"), "m_slides", true);
    shares.view(output("v2"), "m_slides", true);
    shares.view(output("v3"), "m_slides", true);
    shares.view(output("v1"), "m_slides", true);
    expect(to("v3")).toEqual([
      {
        type: "share-viewing",
        mediaId: "m_slides",
        viewing: {
          status: "refused",
          error: "“Slides” has 2 Viewers, the most a Screen Share takes.",
        },
      },
    ]);
    expect(to("v1").at(-1)).toMatchObject({ viewing: { status: "idle" } });
    shares.view(output("v4"), "m_logo", true);
    expect(to("v4")).toEqual([
      {
        type: "share-viewing",
        mediaId: "m_logo",
        viewing: {
          status: "refused",
          error:
            "“Logo” is not a Screen Share; only a Media item of kind share can be shared into.",
        },
      },
    ]);
  });

  it("replaces a Sharer, telling it, and moves the Viewers to the new one", () => {
    const { shares, to, slot } = setup();
    shares.declare(desktop("d1"), "m_slides", laptop, false);
    shares.view(output("v1"), "m_slides", true);
    const first = to("v1")[0];
    to("d1");
    shares.declare(desktop("d2"), "m_slides", booth, false);
    expect(to("d1")).toEqual([
      {
        type: "share-ended",
        mediaId: "m_slides",
        reason: "replaced",
        message: "Booth shares into “Slides” now.",
      },
    ]);
    expect(to("d2")).toEqual([
      {
        type: "share-viewer",
        mediaId: "m_slides",
        viewerId: "v1",
        joined: true,
      },
    ]);
    const [moved] = to("v1");
    expect(moved).toMatchObject({ viewing: { status: "live" } });
    expect(moved).not.toEqual(first);
    expect(slot()).toMatchObject({
      sharer: "Booth",
      source: "screen",
      viewers: 1,
    });
    // The replaced Sharer can no longer reach the Viewer.
    shares.receive(desktop("d1"), {
      type: "share-signal",
      mediaId: "m_slides",
      viewerId: "v1",
      payload: "late",
    });
    expect(to("v1")).toEqual([]);
  });

  it("stops a share for any client, telling the Sharer and the Viewers", () => {
    const { shares, to, slot } = setup();
    expect(shares.stop("m_slides")).toEqual({
      ok: false,
      error: "Nobody shares into “Slides”.",
    });
    expect(shares.stop("m_logo")).toMatchObject({ ok: false });
    shares.declare(desktop("d1"), "m_slides", laptop, false);
    shares.view(output("v1"), "m_slides", true);
    to("d1");
    to("v1");
    expect(shares.stop("m_slides")).toEqual({
      ok: true,
      result: { mediaId: "m_slides", sharer: "Laptop" },
    });
    expect(to("d1")).toEqual([
      {
        type: "share-ended",
        mediaId: "m_slides",
        reason: "stopped",
        message: "Another client stopped this share.",
      },
    ]);
    expect(to("v1")).toEqual([
      {
        type: "share-viewing",
        mediaId: "m_slides",
        viewing: { status: "idle" },
      },
    ]);
    expect(slot()).toEqual({ status: "idle" });
  });

  it("ends a share whose slot leaves the document and keeps one whose slot stays", () => {
    const { shares, to, slot, setDocument, patches } = setup();
    shares.declare(desktop("d1"), "m_slides", laptop, false);
    shares.view(output("v1"), "m_slides", true);
    to("d1");
    to("v1");
    // Another document holding a share item with the same id: the share goes on.
    setDocument(withMedia({ m_slides: slides.m_slides } as Document["media"]));
    expect(to("d1")).toEqual([]);
    expect(slot()).toMatchObject({ status: "live" });
    patches.length = 0;
    setDocument(withMedia({}));
    expect(patches).toEqual([{ op: "remove", path: ["media", "m_slides"] }]);
    expect(to("d1")).toEqual([
      {
        type: "share-ended",
        mediaId: "m_slides",
        reason: "removed",
        message: "No Screen Share “m_slides” in the open Installation.",
      },
    ]);
    expect(to("v1")).toEqual([
      {
        type: "share-viewing",
        mediaId: "m_slides",
        viewing: {
          status: "refused",
          error: "No Screen Share “m_slides” in the open Installation.",
        },
      },
    ]);
    // A file under the same id is no slot.
    setDocument(withMedia({ m_slides: slides.m_logo } as Document["media"]));
    expect(shares.state()).toEqual({});
  });

  it("drops a Viewer whose socket closed and tells the Sharer", () => {
    const { shares, to, slot } = setup();
    shares.declare(desktop("d1"), "m_slides", laptop, false);
    shares.view(output("v1"), "m_slides", true);
    to("d1");
    shares.disconnected("v1");
    expect(to("d1")).toEqual([
      {
        type: "share-viewer",
        mediaId: "m_slides",
        viewerId: "v1",
        joined: false,
      },
    ]);
    expect(slot()).toMatchObject({ viewers: 0 });
  });

  it("keeps a share interrupted for the same Sharer, who finds the Viewers that came meanwhile", () => {
    const { shares, to, slot } = setup();
    shares.declare(desktop("d1", "desk"), "m_slides", laptop, false);
    shares.view(output("v1"), "m_slides", true);
    shares.view(output("v2"), "m_slides", true);
    to("d1");
    to("v1");
    shares.disconnected("d1");
    expect(slot()).toMatchObject({
      status: "interrupted",
      viewers: 2,
      since: 1_000,
    });
    expect(to("v1")).toMatchObject([{ viewing: { status: "interrupted" } }]);
    // Meanwhile one Viewer leaves and another joins; the Viewer's payloads go nowhere.
    shares.view(output("v2"), "m_slides", false);
    shares.view(output("v3"), "m_slides", true);
    expect(to("v3")[0]).toMatchObject({ viewing: { status: "interrupted" } });
    // Someone else resuming is refused: the slot is the away Sharer's.
    shares.declare(desktop("d9", "other"), "m_slides", booth, true);
    expect(to("d9")[0]).toMatchObject({
      type: "share-ended",
      reason: "replaced",
    });
    vi.advanceTimersByTime(4_000);
    shares.declare(desktop("d2", "desk"), "m_slides", laptop, true);
    expect(slot()).toMatchObject({ status: "live", since: 1_000, viewers: 2 });
    expect(to("d2")).toEqual([
      {
        type: "share-viewer",
        mediaId: "m_slides",
        viewerId: "v2",
        joined: false,
      },
      {
        type: "share-viewer",
        mediaId: "m_slides",
        viewerId: "v3",
        joined: true,
      },
    ]);
    expect(to("v1")).toMatchObject([{ viewing: { status: "live" } }]);
    // The timer from the interruption no longer applies.
    vi.advanceTimersByTime(10_000);
    expect(slot()).toMatchObject({ status: "live" });
  });

  it("starts a new share when the away Sharer declares anew, announcing every Viewer", () => {
    const { shares, to, slot } = setup();
    shares.declare(desktop("d1", "desk"), "m_slides", laptop, false);
    shares.view(output("v1"), "m_slides", true);
    const first = to("v1").at(-1);
    shares.disconnected("d1");
    to("v1");
    vi.advanceTimersByTime(1_000);
    // The same Desktop, started again: it holds no connection to v1.
    shares.declare(desktop("d2", "desk"), "m_slides", laptop, false);
    expect(slot()).toMatchObject({ status: "live", viewers: 1 });
    expect(to("d2")).toEqual([
      {
        type: "share-viewer",
        mediaId: "m_slides",
        viewerId: "v1",
        joined: true,
      },
    ]);
    const second = to("v1").at(-1);
    expect(second).toMatchObject({ viewing: { status: "live" } });
    expect(second).not.toEqual(first);
    // The interruption's timer does not idle the new share.
    vi.advanceTimersByTime(10_000);
    expect(slot()).toMatchObject({ status: "live" });
  });

  it("falls to idle when the Sharer is not back in time, and a resume then starts anew", () => {
    const { shares, to, slot } = setup();
    shares.declare(desktop("d1", "desk"), "m_slides", laptop, false);
    shares.view(output("v1"), "m_slides", true);
    to("v1");
    shares.disconnected("d1");
    vi.advanceTimersByTime(5_000);
    expect(slot()).toEqual({ status: "idle" });
    expect(to("v1").at(-1)).toMatchObject({ viewing: { status: "idle" } });
    shares.declare(desktop("d2", "desk"), "m_slides", laptop, true);
    expect(slot()).toMatchObject({ status: "live", viewers: 1 });
    expect(to("d2")).toEqual([
      {
        type: "share-viewer",
        mediaId: "m_slides",
        viewerId: "v1",
        joined: true,
      },
    ]);
  });

  it("does not let a Sharer replaced while away take the slot back", () => {
    const { shares, to, slot } = setup();
    shares.declare(desktop("d1", "desk"), "m_slides", laptop, false);
    shares.disconnected("d1");
    shares.declare(desktop("d2", "booth"), "m_slides", booth, false);
    expect(slot()).toMatchObject({ status: "live", sharer: "Booth" });
    shares.declare(desktop("d3", "desk"), "m_slides", laptop, true);
    expect(to("d3")).toEqual([
      {
        type: "share-ended",
        mediaId: "m_slides",
        reason: "replaced",
        message:
          "Another Sharer shares into “Slides” now; it took the slot while this one was away.",
      },
    ]);
    expect(slot()).toMatchObject({ sharer: "Booth" });
    // The old interruption's timer does not idle the new share.
    vi.advanceTimersByTime(10_000);
    expect(slot()).toMatchObject({ status: "live", sharer: "Booth" });
  });
});
