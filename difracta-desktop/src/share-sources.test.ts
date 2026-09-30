import { describe, expect, it } from "vitest";

import {
  screenAccess,
  sharePicker,
  sourceChoices,
  sourceKind,
  sourceToGrant,
} from "./share-sources.ts";

const none: readonly { id: string }[] = [];
const listed = [
  { id: "screen:0:0", name: "Entire screen", thumbnail: null },
  { id: "window:41:0", name: "Slides", thumbnail: "data:image/png;base64,AA" },
  { id: "window:77:0", name: "Share Screen - Difracta", thumbnail: null },
  { id: "screen:1:0", name: "Projector", thumbnail: null },
  { id: "tab:1", name: "Something else", thumbnail: null },
];

describe("Choosing what to share", () => {
  it("leaves the asking to the system on a Wayland session, whatever Desktop's windows run on", () => {
    const linux = (env: Record<string, string>) =>
      sharePicker({ platform: "linux", env });
    expect(linux({ XDG_SESSION_TYPE: "wayland" })).toBe("system");
    expect(
      linux({ XDG_SESSION_TYPE: "x11", WAYLAND_DISPLAY: "wayland-0" }),
    ).toBe("system");
    expect(linux({ XDG_SESSION_TYPE: "x11" })).toBe("own");
    expect(linux({ XDG_SESSION_TYPE: "x11", WAYLAND_DISPLAY: "" })).toBe("own");
    expect(linux({})).toBe("own");
    for (const platform of ["darwin", "win32"] as const)
      expect(
        sharePicker({ platform, env: { XDG_SESSION_TYPE: "wayland" } }),
      ).toBe("own");
  });

  it("reads a source's kind from its id", () => {
    expect(sourceKind("screen:0:0")).toBe("screen");
    expect(sourceKind("window:41:0")).toBe("window");
    expect(sourceKind("tab:1")).toBeUndefined();
    expect(sourceKind("")).toBeUndefined();
  });

  it("lists one kind, in the system's order, without the share window", () => {
    expect(sourceChoices(listed, "window", "window:77:0")).toEqual([
      {
        id: "window:41:0",
        kind: "window",
        name: "Slides",
        thumbnail: "data:image/png;base64,AA",
      },
    ]);
    expect(sourceChoices(listed, "screen").map((source) => source.id)).toEqual([
      "screen:0:0",
      "screen:1:0",
    ]);
    expect(sourceChoices([], "screen")).toEqual([]);
  });

  it("grants what the system's picker returned, as it is", () => {
    expect(sourceToGrant("system", [{ id: "window:9:0" }], undefined)).toEqual({
      id: "window:9:0",
    });
    // Cancelled: the system returned nothing.
    expect(sourceToGrant("system", none, "window:9:0")).toBeUndefined();
  });

  it("grants the one chosen in the share window, and only one that was listed", () => {
    expect(sourceToGrant("own", listed, "window:41:0")?.name).toBe("Slides");
    expect(sourceToGrant("own", listed, undefined)).toBeUndefined();
    expect(sourceToGrant("own", listed, "window:1:0")).toBeUndefined();
    expect(sourceToGrant("own", none, "window:41:0")).toBeUndefined();
  });

  it("knows a Mac that refuses the screen, and nothing of other systems", () => {
    expect(screenAccess("darwin", "granted")).toBe("granted");
    expect(screenAccess("darwin", "denied")).toBe("denied");
    expect(screenAccess("darwin", "restricted")).toBe("denied");
    expect(screenAccess("darwin", "not-determined")).toBe("unknown");
    expect(screenAccess("linux", "granted")).toBe("unknown");
    expect(screenAccess("win32", undefined)).toBe("unknown");
  });
});
