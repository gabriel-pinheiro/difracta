import type { Media, Table } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { shareSlots, slotStatus } from "./share-slots";

const item = (
  id: string,
  kind: Media["kind"],
  order: string,
  parentId: string | null = null,
): Media =>
  ({
    id,
    kind,
    name: id.replace("m_", ""),
    parentId,
    order,
    ...(kind === "file" ? { path: `${id}.png` } : {}),
  }) as Media;

const media: Table<Media> = {
  m_logo: item("m_logo", "file", "a"),
  m_stage: item("m_stage", "group", "b"),
  m_laptop: item("m_laptop", "share", "a", "m_stage"),
  m_booth: item("m_booth", "share", "c"),
  m_guest: item("m_guest", "share", "d"),
};

describe("The slots the share window offers", () => {
  it("lists the Screen Shares in navigator order, with who shares into each", () => {
    const slots = shareSlots(
      media,
      {
        m_logo: { status: "ok" },
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
        name: "stage · laptop",
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
    expect(
      shareSlots({ m_logo: item("m_logo", "file", "a") }, {}, new Set()),
    ).toEqual([]);
  });

  it("takes a slot the live state has not named yet for one nobody shares into", () => {
    const [slot] = shareSlots(
      { m_booth: item("m_booth", "share", "a") },
      {},
      new Set(),
    );
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
