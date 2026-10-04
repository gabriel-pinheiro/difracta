import { settings, type Share, type Table } from "@difracta/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeLivePage, settle } from "./live-fakes.ts";
import { LiveViewer } from "./live-viewer.ts";

const { viewer: tuning } = settings.shares;

const slot = (id: string): Share => ({ id, name: id, order: "a" }) as Share;
const table = (...ids: string[]): Table<Share> =>
  Object.fromEntries(ids.map((id) => [id, slot(id)]));
const wanted = (...ids: string[]): ReadonlySet<string> => new Set(ids);

const offer = (connection: string, sdp = "offer-sdp") => ({
  type: "offer",
  connection,
  sdp,
});
const ice = (connection: string, candidate: string | null) => ({
  type: "ice",
  connection,
  candidate: candidate === null ? null : { candidate, sdpMid: "0" },
});

function viewing(...ids: string[]) {
  const page = fakeLivePage();
  const viewer = new LiveViewer(page.options);
  viewer.sync(wanted(...ids), table(...ids));
  return { page, viewer };
}

/** A slot whose share is live, connected and showing a frame. */
async function showing(id = "m_screen") {
  const made = viewing(id);
  const { page } = made;
  page.say(id, { status: "live", share: "s1" });
  page.deliver(id, offer("c1"));
  await settle();
  page.peer().track();
  page.peer().reach("connected");
  page.element().present();
  return made;
}

describe("The engine's Viewer", () => {
  // A connection that could not be made is said on the console.
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("views nothing and answers nothing without signalling", () => {
    const viewer = new LiveViewer();
    viewer.sync(wanted("m_screen"), table("m_screen"));
    expect(viewer.live("m_screen")).toBeUndefined();
    expect(viewer.shares()).toEqual({ viewed: 0, connected: 0 });
    viewer.dispose();
  });

  it("views a slot when it is wanted and leaves a while after it no longer is", () => {
    const { page, viewer } = viewing("m_screen");
    expect(page.calls).toEqual(["view m_screen"]);
    expect(viewer.live("m_screen")?.handle.image).toBeNull();
    // The same set and table again ask nothing.
    const same = wanted("m_screen");
    const media = table("m_screen");
    viewer.sync(same, media);
    viewer.sync(same, media);
    expect(page.calls).toEqual(["view m_screen"]);

    viewer.sync(wanted(), media);
    expect(page.calls).toEqual(["view m_screen"]);
    expect(page.timers.waits()).toEqual([tuning.leaveAfterMs]);
    // Wanted again in time: it never left.
    viewer.sync(wanted("m_screen"), media);
    expect(page.timers.waits()).toEqual([]);
    viewer.sync(wanted(), media);
    page.timers.expire();
    expect(page.calls).toEqual(["view m_screen", "leave m_screen"]);
    expect(viewer.live("m_screen")).toBeUndefined();
    expect(viewer.shares()).toEqual({ viewed: 0, connected: 0 });
  });

  it("leaves at once a slot the Installation lost", async () => {
    const { page, viewer } = await showing();
    viewer.sync(wanted(), table());
    expect(page.calls.at(-1)).toBe("leave m_screen");
    expect(page.peer().closed).toBe(true);
    expect(page.element().counting).toBe(false);
    expect(page.timers.waits()).toEqual([]);
  });

  it("answers the Sharer's offer and shows the picture once a frame arrived", async () => {
    const { page, viewer } = viewing("m_screen");
    const live = viewer.live("m_screen");
    page.say("m_screen", { status: "live", share: "s1" });
    page.deliver("m_screen", offer("c1"));
    await settle();
    expect(page.peer().calls).toEqual(["remote offer-sdp", "answer", "local"]);
    expect(page.sent).toEqual([
      {
        id: "m_screen",
        payload: { type: "answer", connection: "c1", sdp: "answer-sdp" },
      },
    ]);
    const stream = { stream: 1 };
    page.peer().track(stream);
    expect(page.element().srcObject).toBe(stream);
    expect(page.element().plays).toBe(1);
    expect(live?.handle).toMatchObject({ image: null, version: 0 });
    page.peer().reach("connected");
    expect(viewer.shares()).toEqual({ viewed: 1, connected: 1 });
    page.element().present(1920, 1080);
    expect(live?.handle.image).toBe(page.element());
    expect(live?.handle).toMatchObject({ width: 1920, height: 1080 });
    const version = live?.handle.version ?? 0;
    expect(version).toBeGreaterThan(0);
    page.element().present(1920, 1080);
    expect(live?.handle.version).toBe(version + 1);
    expect(live?.lost).toBe(false);
  });

  it("sends its candidates and adds the Sharer's, those before the description after it", async () => {
    const { page } = viewing("m_screen");
    page.say("m_screen", { status: "live", share: "s1" });
    page.deliver("m_screen", ice("c1", "too-early"));
    page.deliver("m_screen", offer("c1"));
    // Arrives while the description is still being set.
    page.deliver("m_screen", ice("c1", "first"));
    await settle();
    page.deliver("m_screen", ice("c1", "second"));
    page.deliver("m_screen", ice("c1", null));
    page.deliver("m_screen", ice("c0", "of-another-connection"));
    page.deliver("m_screen", { type: "hello" });
    await settle();
    expect(page.peer().calls).toEqual([
      "remote offer-sdp",
      "answer",
      "local",
      "ice first",
      "ice second",
      "ice end",
    ]);
    page.peer().onicecandidate?.({
      candidate: { toJSON: () => ({ candidate: "mine", sdpMid: "0" }) },
    });
    page.peer().onicecandidate?.({ candidate: null });
    expect(page.sent.slice(1).map((sent) => sent.payload)).toEqual([
      {
        type: "ice",
        connection: "c1",
        candidate: {
          candidate: "mine",
          sdpMid: "0",
          sdpMLineIndex: null,
          usernameFragment: null,
        },
      },
      { type: "ice", connection: "c1", candidate: null },
    ]);
  });

  it("replaces the connection on a new offer, keeping the frame it has", async () => {
    const { page, viewer } = await showing();
    const live = viewer.live("m_screen");
    page.deliver("m_screen", offer("c2", "again"));
    await settle();
    expect(page.peers).toHaveLength(2);
    expect(page.peer(0).closed).toBe(true);
    expect(page.peer(1).calls).toEqual(["remote again", "answer", "local"]);
    // The first connection's late words change nothing.
    page.peer(0).reach("failed");
    page.deliver("m_screen", ice("c1", "late"));
    await settle();
    expect(page.peer(1).calls).not.toContain("ice late");
    expect(live?.handle.image).toBe(page.element());
    expect(live?.lost).toBe(false);
    expect(page.calls).toEqual(["view m_screen"]);
  });

  it("drops the connection for another share and waits for its Sharer's offer", async () => {
    const { page, viewer } = await showing();
    page.say("m_screen", { status: "live", share: "s2" });
    expect(page.peer().closed).toBe(true);
    expect(viewer.shares()).toEqual({ viewed: 1, connected: 0 });
    // The offer is on its way; asked for only if none came.
    expect(page.timers.waits()).toEqual([tuning.askEveryMs]);
    page.deliver("m_screen", offer("c2"));
    await settle();
    expect(page.timers.waits()).toEqual([]);
    expect(page.calls).toEqual(["view m_screen"]);
  });

  it("asks for a new offer after a while disconnected, and again until one arrives", async () => {
    const { page, viewer } = await showing();
    const live = viewer.live("m_screen");
    page.peer().reach("disconnected");
    expect(live?.lost).toBe(true);
    expect(live?.handle.image).toBe(page.element());
    expect(page.timers.waits()).toEqual([tuning.askAfterDisconnectedMs]);
    page.timers.expire();
    expect(page.calls).toEqual(["view m_screen", "ask m_screen"]);
    expect(page.timers.waits()).toEqual([tuning.askEveryMs]);
    page.timers.expire();
    expect(page.calls.filter((call) => call === "ask m_screen")).toHaveLength(
      2,
    );
    page.deliver("m_screen", offer("c2"));
    await settle();
    expect(page.timers.waits()).toEqual([]);
    // The frame held is still the dropped connection's, until the new one presents its own.
    expect(live?.lost).toBe(true);
    page.peer().track();
    expect(live?.lost).toBe(true);
    page.element().present();
    expect(live?.lost).toBe(false);
    page.peer().reach("connected");
    expect(live?.lost).toBe(false);
    expect(viewer.shares()).toMatchObject({ connected: 1 });
  });

  it("keeps a dropped picture lost through another share, until that one presents a frame", async () => {
    const { page, viewer } = await showing();
    const live = viewer.live("m_screen");
    page.say("m_screen", { status: "interrupted", share: "s1" });
    page.peer().reach("disconnected");
    expect(live?.lost).toBe(true);
    page.say("m_screen", { status: "live", share: "s2" });
    expect(live?.lost).toBe(true);
    page.deliver("m_screen", offer("c2"));
    await settle();
    page.peer().track();
    page.peer().reach("connected");
    expect(live?.lost).toBe(true);
    page.element().present();
    expect(live?.lost).toBe(false);
  });

  it("stops asking when a disconnected connection comes back by itself", async () => {
    const { page, viewer } = await showing();
    page.peer().reach("disconnected");
    page.peer().reach("connected");
    expect(page.timers.waits()).toEqual([]);
    expect(viewer.live("m_screen")?.lost).toBe(false);
    expect(page.peers).toHaveLength(1);
  });

  it("asks at once when the connection failed, and when the offer could not be taken", async () => {
    const { page, viewer } = await showing();
    page.peer().reach("failed");
    expect(page.peer().closed).toBe(true);
    expect(viewer.live("m_screen")?.lost).toBe(true);
    expect(page.timers.waits()).toEqual([0]);
    page.timers.expire();
    expect(page.calls.at(-1)).toBe("ask m_screen");

    const refusing = fakeLivePage();
    const second = new LiveViewer({
      ...refusing.options,
      createPeer: () => {
        const peer = refusing.options.createPeer();
        refusing.peer().refuses = true;
        return peer;
      },
    });
    second.sync(wanted("m_screen"), table("m_screen"));
    refusing.say("m_screen", { status: "live", share: "s1" });
    refusing.deliver("m_screen", offer("c1"));
    await settle();
    expect(refusing.peer().closed).toBe(true);
    expect(refusing.timers.waits()).toEqual([0]);
    expect(refusing.sent).toEqual([]);
  });

  it("keeps the connection of an interrupted share, and asks only if it drops", async () => {
    const { page, viewer } = await showing();
    page.say("m_screen", { status: "interrupted", share: "s1" });
    expect(page.peer().closed).toBe(false);
    expect(viewer.live("m_screen")?.lost).toBe(false);
    expect(page.timers.waits()).toEqual([]);
    page.peer().reach("disconnected");
    expect(page.timers.waits()).toEqual([tuning.askAfterDisconnectedMs]);
    page.say("m_screen", { status: "live", share: "s1" });
    expect(page.peer().closed).toBe(false);
    expect(page.timers.waits()).toEqual([tuning.askAfterDisconnectedMs]);
  });

  it("empties the picture when nobody shares any more", async () => {
    const { page, viewer } = await showing();
    const live = viewer.live("m_screen");
    page.say("m_screen", { status: "idle" });
    expect(page.peer().closed).toBe(true);
    expect(page.element().srcObject).toBeNull();
    expect(live?.handle).toMatchObject({ image: null, version: 0 });
    expect(live?.lost).toBe(false);
    expect(page.timers.waits()).toEqual([]);
    // A frame of the stream that ended shows nothing.
    page.element().present();
    expect(live?.handle.image).toBeNull();
  });

  it("reports a refused Viewer and asks to view again now and then", () => {
    const { page, viewer } = viewing("m_screen", "m_other");
    page.say("m_screen", { status: "refused", error: "“Screen” is full." });
    expect(viewer.shares()).toEqual({
      viewed: 2,
      connected: 0,
      refused: "“Screen” is full.",
    });
    expect(page.timers.waits()).toEqual([tuning.retryRefusedMs]);
    page.timers.expire();
    expect(page.calls.at(-1)).toBe("ask m_screen");
    expect(page.timers.waits()).toEqual([tuning.retryRefusedMs]);
    page.say("m_screen", { status: "idle" });
    expect(viewer.shares()).toEqual({ viewed: 2, connected: 0 });
    expect(page.timers.waits()).toEqual([]);
  });

  it("takes up a slot this connection views already", () => {
    const page = fakeLivePage();
    page.say("m_screen", { status: "live", share: "s1" });
    const viewer = new LiveViewer(page.options);
    viewer.sync(wanted("m_screen"), table("m_screen"));
    expect(page.calls).toEqual(["view m_screen", "ask m_screen"]);
    expect(page.timers.waits()).toEqual([tuning.askEveryMs]);
  });

  it("leaves every slot and hears nothing more once disposed", async () => {
    const { page, viewer } = await showing();
    viewer.sync(wanted("m_screen", "m_other"), table("m_screen", "m_other"));
    page.peer().reach("disconnected");
    viewer.dispose();
    expect(page.calls.slice(-2)).toEqual(["leave m_screen", "leave m_other"]);
    expect(page.peer().closed).toBe(true);
    expect(page.element(0).counting).toBe(false);
    expect(page.timers.waits()).toEqual([]);
    expect(page.listeners()).toBe(0);
    expect(viewer.live("m_screen")).toBeUndefined();
  });
});
