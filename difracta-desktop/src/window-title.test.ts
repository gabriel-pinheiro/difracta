import { describe, expect, it } from "vitest";

import { windowTitle } from "./window-title.ts";

const local = { kind: "local", home: "/home/ana" } as const;
const remote = { kind: "remote", label: "stage-pc (10.0.0.5:4800)" } as const;
const living = {
  name: "Living",
  path: "/home/ana/shows/living.difracta",
  dirty: false,
};

describe("the Studio window's title", () => {
  it("names the Installation and its file, the home directory as ~", () => {
    expect(windowTitle(living, local)).toBe(
      "Living - ~/shows/living.difracta - Difracta",
    );
    expect(
      windowTitle({ ...living, path: "/mnt/show/living.difracta" }, local),
    ).toBe("Living - /mnt/show/living.difracta - Difracta");
    // A folder that only starts like the home directory is not inside it.
    expect(
      windowTitle({ ...living, path: "/home/anabel/l.difracta" }, local),
    ).toBe("Living - /home/anabel/l.difracta - Difracta");
    expect(
      windowTitle(
        { ...living, path: "C:\\Users\\ana\\shows\\living.difracta" },
        { kind: "local", home: "C:\\Users\\ana" },
      ),
    ).toBe("Living - ~\\shows\\living.difracta - Difracta");
  });

  it("has no file for an Installation that was never saved", () => {
    expect(
      windowTitle({ name: "Untitled", path: null, dirty: false }, local),
    ).toBe("Untitled - Difracta");
  });

  it("names the runtime instead of the file when it is elsewhere", () => {
    expect(
      windowTitle({ ...living, path: "/srv/living.difracta" }, remote),
    ).toBe("Living - stage-pc (10.0.0.5:4800) - Difracta");
  });

  it("marks unsaved changes in front", () => {
    expect(windowTitle({ ...living, dirty: true }, local)).toBe(
      "* Living - ~/shows/living.difracta - Difracta",
    );
    expect(windowTitle({ ...living, dirty: true }, remote)).toBe(
      "* Living - stage-pc (10.0.0.5:4800) - Difracta",
    );
  });

  it("says where it is with nothing open", () => {
    expect(windowTitle(null, local)).toBe("Difracta");
    expect(windowTitle(null, remote)).toBe(
      "stage-pc (10.0.0.5:4800) - Difracta",
    );
  });

  it("is plain ASCII whatever the state", () => {
    for (const where of [local, remote])
      for (const document of [null, living, { ...living, dirty: true }])
        expect(windowTitle(document, where)).toMatch(/^[\x20-\x7e]+$/);
  });
});
