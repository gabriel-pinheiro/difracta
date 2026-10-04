import type { Share, Table } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { activeShares, shareLive, shareSlots, slotStatus } from "./share-slots";

const item = (id: string, order: string): Share =>
  ({ id, name: id.replace("m_", ""), order }) as Share;

const media: Table<Share> = {
  m_laptop: item("m_laptop", "a"),
  m_booth: item("m_booth", "c"),
  m_guest: item("m_guest", "d"),
};

describe("The slots the share window offers", () => {
  it("lists the Screen Shares in navigator order, with who shares into each", () => {
    const slots = shareSlots(
      media,
      {
        m_laptop: { status: "idle" },
        m_booth: {
          status: "live",
          sharer: "booth-pc",
          source: "screen",
          since: 1,
          viewers: 2,
        },
        m_guest: {
          status: "interrupted",
          sharer: "guest",
          source: "window",
          since: 1,
          viewers: 0,
        },
      },
      new Set(["m_laptop"]),
    );
    expect(slots).toEqual([
      {
        id: "m_laptop",
        name: "laptop",
        interrupted: false,
        mine: true,
      },
      {
        id: "m_booth",
        name: "booth",
        sharer: "booth-pc",
        interrupted: false,
        mine: false,
      },
      {
        id: "m_guest",
        name: "guest",
        sharer: "guest",
        interrupted: true,
        mine: false,
      },
    ]);
    expect(slots.map(slotStatus)).toEqual([
      "This computer shares into it",
      "booth-pc shares into it; sharing takes its place",
      "guest was sharing into it and lost its connection",
    ]);
  });

  it("has none without an Installation, or in one without Screen Shares", () => {
    expect(shareSlots(undefined, {}, new Set())).toEqual([]);
    expect(shareSlots({}, {}, new Set())).toEqual([]);
  });

  it("takes a slot the live state has not named yet for one nobody shares into", () => {
    const [slot] = shareSlots({ m_booth: item("m_booth", "a") }, {}, new Set());
    expect(slot).toEqual({
      id: "m_booth",
      name: "booth",
      interrupted: false,
      mine: false,
    });
    expect(slot === undefined ? "" : slotStatus(slot)).toBe(
      "Nobody shares into it",
    );
  });
});

describe("Studio's reading of the slots", () => {
  const booth = {
    status: "live",
    sharer: "booth-pc",
    source: "screen",
    since: 5,
    viewers: 1,
  } as const;

  it("reads a slot's entry, idle until the runtime says more", () => {
    expect(shareLive(undefined)).toEqual({ status: "idle" });
    expect(shareLive({ status: "idle" })).toEqual({ status: "idle" });
    expect(shareLive(booth)).toBe(booth);
  });

  it("lists the slots somebody shares into, interrupted ones included", () => {
    expect(
      activeShares(media, {
        m_laptop: { status: "idle" },
        m_booth: booth,
        m_guest: { ...booth, status: "interrupted", sharer: "guest" },
      }),
    ).toEqual([
      {
        id: "m_booth",
        name: "booth",
        sharer: "booth-pc",
        interrupted: false,
        mine: false,
      },
      {
        id: "m_guest",
        name: "guest",
        sharer: "guest",
        interrupted: true,
        mine: false,
      },
    ]);
    expect(activeShares(media, {})).toEqual([]);
    expect(activeShares(undefined, { m_booth: booth })).toEqual([]);
  });
});
