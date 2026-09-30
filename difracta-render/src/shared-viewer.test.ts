import { settings, type Media, type Table } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { fakeLivePage, settle } from "./live-fakes.ts";
import { SharedViewer } from "./shared-viewer.ts";

const slot = (id: string): Media =>
  ({ id, kind: "share", name: id, parentId: null, order: "a" }) as Media;
const table = (...ids: string[]): Table<Media> =>
  Object.fromEntries(ids.map((id) => [id, slot(id)]));
const media = table("m_a", "m_b");

function page() {
  const fake = fakeLivePage();
  return { fake, shared: new SharedViewer(fake.options) };
}

describe("The Viewer a page shares", () => {
  it("views a slot once however many claims want it", () => {
    const { fake, shared } = page();
    const preview = shared.claim();
    const crop = shared.claim();
    preview.sync(new Set(["m_a"]), media);
    crop.sync(new Set(["m_a"]), media);
    expect(fake.calls).toEqual(["view m_a"]);
    expect(shared.wanted).toEqual(new Set(["m_a"]));
    expect(fake.listeners()).toBe(2);
  });

  it("keeps a slot while any claim wants it, and leaves it after the delay once none does", () => {
    const { fake, shared } = page();
    const preview = shared.claim();
    const crop = shared.claim();
    preview.sync(new Set(["m_a"]), media);
    crop.sync(new Set(["m_a", "m_b"]), media);
    expect(fake.calls).toEqual(["view m_a", "view m_b"]);
    crop.dispose();
    expect(shared.claims).toBe(1);
    expect(shared.wanted).toEqual(new Set(["m_a"]));
    expect(fake.timers.waits()).toEqual([settings.shares.viewer.leaveAfterMs]);
    fake.timers.expire();
    expect(fake.calls).toEqual(["view m_a", "view m_b", "leave m_b"]);
    preview.pause();
    fake.timers.expire();
    expect(fake.calls.at(-1)).toBe("leave m_a");
  });

  it("views again what a paused claim syncs next, as the Preview coming back does", () => {
    const { fake, shared } = page();
    const preview = shared.claim();
    const wanted = new Set(["m_a"]);
    preview.sync(wanted, media);
    preview.pause();
    expect(shared.wanted.size).toBe(0);
    // The engine hands the same set again; the claim must not take it for no change.
    preview.sync(wanted, media);
    expect(shared.wanted).toEqual(wanted);
    expect(fake.timers.waits()).toEqual([]);
    expect(fake.calls).toEqual(["view m_a"]);
  });

  it("gives every claim the same picture", async () => {
    const { fake, shared } = page();
    const preview = shared.claim();
    const crop = shared.claim();
    preview.sync(new Set(["m_a"]), media);
    crop.sync(new Set(["m_a"]), media);
    fake.say("m_a", { status: "live", share: "s1" });
    fake.deliver("m_a", { type: "offer", connection: "c1", sdp: "offer" });
    await settle();
    fake.peer().track();
    fake.peer().reach("connected");
    fake.element().present(1920, 1080);
    expect(fake.peers).toHaveLength(1);
    expect(fake.sent).toHaveLength(1);
    expect(preview.live("m_a")).toBe(crop.live("m_a"));
    expect(crop.live("m_a")?.handle.width).toBe(1920);
    expect(shared.live("m_a")?.handle.image).not.toBeNull();
    expect(crop.shares()).toEqual({ viewed: 1, connected: 1 });
  });

  it("forgets a claim disposed twice, and leaves everything with the page", () => {
    const { fake, shared } = page();
    const preview = shared.claim();
    preview.sync(new Set(["m_a"]), media);
    preview.dispose();
    preview.dispose();
    preview.sync(new Set(["m_b"]), media);
    expect(shared.claims).toBe(0);
    expect(fake.calls).toEqual(["view m_a"]);
    shared.dispose();
    expect(fake.calls).toEqual(["view m_a", "leave m_a"]);
    expect(fake.listeners()).toBe(0);
  });
});
