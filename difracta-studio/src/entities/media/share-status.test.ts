import { settings } from "@difracta/core";
import { describe, expect, it } from "vitest";

import {
  describeShare,
  sinceText,
  sourceText,
  viewersText,
} from "./share-status";

const live = {
  status: "live",
  sharer: "gabriel-laptop",
  source: "window",
  since: 0,
  viewers: 2,
} as const;

describe("A Screen Share's status in Studio", () => {
  it("says how to start one while idle, naming Desktop's menu item", () => {
    const idle = describeShare({ status: "idle" });
    expect(idle.word).toBe("idle");
    expect(idle.explanation).toContain("File ▸ Share Screen...");
  });

  it("names the Sharer and its source while live or interrupted", () => {
    expect(describeShare(live)).toMatchObject({
      word: "live",
      explanation: "gabriel-laptop shares a window into it.",
    });
    const interrupted = describeShare({ ...live, status: "interrupted" });
    expect(interrupted.word).toBe("interrupted");
    expect(interrupted.explanation).toContain(
      `within ${String(settings.shares.interruptedForMs / 1000)} s`,
    );
    expect(sourceText("screen")).toBe("a screen");
  });

  it("says how long a share has run, never ahead of now", () => {
    const start = new Date(2026, 8, 29, 21, 4).getTime();
    const time = new Date(start).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    expect(sinceText(start, start + 12_000)).toBe(`${time}, for 12 s`);
    expect(sinceText(start, start + 5 * 60_000)).toBe(`${time}, for 5 min`);
    expect(sinceText(start, start + 125 * 60_000)).toBe(
      `${time}, for 2 h 5 min`,
    );
    expect(sinceText(start, start - 3000)).toBe(`${time}, for 0 s`);
  });

  it("counts Viewers against the cap", () => {
    expect(viewersText(1)).toBe(
      `1 Viewer of ${String(settings.shares.maxViewers)} a share takes`,
    );
    expect(viewersText(0)).toMatch(/^0 Viewers/);
  });
});
