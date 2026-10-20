import { emptyDocument } from "@difracta/core";
import { EMPTY_LIVE_STATE } from "@difracta/protocol";
import { describe, expect, it } from "vitest";

import { DocumentView } from "./document-view.ts";
import { receiveSnapshot } from "./snapshot-reading.ts";

const share = { id: "share_a", name: "YT Video", order: "a0" };

/** A document as a runtime built from other code might send it. */
function sent(change: (document: Record<string, unknown>) => void): unknown {
  const document: Record<string, unknown> = {
    ...emptyDocument("Living"),
    shares: { share_a: share },
  };
  change(document);
  return document;
}

describe("receiveSnapshot", () => {
  it("reads a document from a runtime that lacks a table, as empty and without complaint", () => {
    const view = new DocumentView("doc");
    const problem = receiveSnapshot(view, {
      revision: 4,
      document: sent((document) => delete document.slices),
    });
    expect(problem).toBeUndefined();
    expect(view.get()?.slices).toEqual({});
    expect(view.get()?.shares).toEqual({ share_a: share });
    expect(view.reading.get()).toEqual({ unreadable: [] });
  });

  it("leaves out a table it does not know, and drops its later patches", () => {
    const view = new DocumentView("doc");
    expect(
      receiveSnapshot(view, {
        revision: 1,
        document: sent((document) => (document.lanterns = { l: {} })),
      }),
    ).toBeUndefined();
    expect(view.get()).not.toHaveProperty("lanterns");
    view.applyDelta(
      [
        { op: "set", path: ["lanterns", "m"], value: {} },
        { op: "set", path: ["shares", "share_a", "name"], value: "Clip" },
      ],
      1,
      2,
    );
    expect(view.get()).not.toHaveProperty("lanterns");
    expect(view.get()?.shares.share_a?.name).toBe("Clip");
  });

  it("shows a table that does not read as empty, names it, and drops its patches", () => {
    const view = new DocumentView("doc");
    const problem = receiveSnapshot(view, {
      revision: 1,
      document: sent(
        (document) => (document.surfaces = { s: { id: "s", shape: "blob" } }),
      ),
    });
    expect(problem).toContain("surfaces");
    expect(view.get()?.surfaces).toEqual({});
    expect(view.get()?.shares).toEqual({ share_a: share });
    expect(view.reading.get().unreadable.map(({ part }) => part)).toEqual([
      "surfaces",
    ]);
    view.applyDelta(
      [{ op: "set", path: ["surfaces", "s", "name"], value: "Wall" }],
      1,
      2,
    );
    expect(view.get()?.surfaces).toEqual({});
    expect(view.revision.get()).toBe(2);
  });

  it("reads live sections the same way", () => {
    const view = new DocumentView("doc", { live: true });
    const { shares: _shares, ...live } = EMPTY_LIVE_STATE;
    const problem = receiveSnapshot(view, {
      revision: 1,
      document: sent(() => undefined),
      live: { ...live, packs: "not packs" },
    });
    expect(problem).toContain("live/packs");
    expect(view.liveState.get()).toEqual(EMPTY_LIVE_STATE);
    view.applyLive([{ op: "set", path: ["packs", "p"], value: {} }]);
    expect(view.liveState.get().packs).toEqual({});
  });

  it("refuses a snapshot whose Installation does not read, and then ignores deltas", () => {
    const view = new DocumentView("doc");
    receiveSnapshot(view, { revision: 1, document: sent(() => undefined) });
    const problem = receiveSnapshot(view, {
      revision: 2,
      document: sent((document) => delete document.installation),
    });
    expect(problem).toContain("installation");
    expect(view.get()).toBeUndefined();
    expect(view.reading.get().failure).toBe("installation: missing");
    // Subscribing again would only bring the same snapshot back.
    expect(view.applyDelta([], 7, 8)).toBe(true);
  });
});
