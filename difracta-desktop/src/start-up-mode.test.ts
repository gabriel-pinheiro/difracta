import { describe, expect, it } from "vitest";

import {
  ignoredNoStudio,
  noStudioFromArgv,
  startUpMode,
  studioUrlFromArgv,
} from "./start-up-mode.ts";

const remote = {
  kind: "remote",
  origin: "http://10.0.0.5:4800",
  name: "Difracta on stage-pc",
} as const;
const nothing = {
  requestedFile: undefined,
  studioUrl: undefined,
  lastMode: undefined,
  noStudioFlag: false,
  startWithoutStudio: false,
};

describe("start-up mode", () => {
  it("asks on the very first launch", () => {
    expect(startUpMode(nothing)).toEqual({ kind: "launch-page" });
  });

  it("resumes the mode of the last launch", () => {
    expect(startUpMode({ ...nothing, lastMode: { kind: "local" } })).toEqual({
      kind: "local",
      file: undefined,
      studioWindow: true,
    });
    expect(startUpMode({ ...nothing, lastMode: remote })).toEqual(remote);
  });

  it("opens a file on this computer whatever the last mode was", () => {
    const requestedFile = "/shows/tonight.difracta";
    for (const lastMode of [undefined, { kind: "local" } as const, remote])
      expect(startUpMode({ ...nothing, requestedFile, lastMode })).toEqual({
        kind: "local",
        file: requestedFile,
        studioWindow: true,
      });
  });

  it("prefers a Studio dev server named on the command line to the last mode", () => {
    const studioUrl = "http://127.0.0.1:4802/studio/";
    expect(startUpMode({ ...nothing, studioUrl, lastMode: remote })).toEqual({
      kind: "studio-url",
      url: studioUrl,
      file: undefined,
    });
    expect(
      studioUrlFromArgv(["electron", ".", "--studio-url", studioUrl]),
    ).toBe(studioUrl);
    expect(studioUrlFromArgv(["electron", `--studio-url=${studioUrl}`])).toBe(
      studioUrl,
    );
    expect(studioUrlFromArgv(["electron", "."])).toBeUndefined();
    expect(studioUrlFromArgv(["electron", "--studio-url"])).toBeUndefined();
  });

  it("starts local mode without the Studio window for the flag or the stored setting", () => {
    const local = { ...nothing, lastMode: { kind: "local" } as const };
    expect(noStudioFromArgv(["electron", ".", "--no-studio"])).toBe(true);
    expect(noStudioFromArgv(["electron", ".", "show.difracta"])).toBe(false);
    for (const [noStudioFlag, startWithoutStudio, studioWindow] of [
      [false, false, true],
      [true, false, false],
      [false, true, false],
      [true, true, false],
    ] as const)
      expect(
        startUpMode({ ...local, noStudioFlag, startWithoutStudio }),
      ).toEqual({ kind: "local", file: undefined, studioWindow });
    // A file from the OS is opened on this computer all the same.
    expect(
      startUpMode({
        ...nothing,
        requestedFile: "/shows/tonight.difracta",
        noStudioFlag: true,
      }),
    ).toMatchObject({ kind: "local", studioWindow: false });
  });

  it("has no use for the flag anywhere but in local mode, and says so", () => {
    const wished = { ...nothing, noStudioFlag: true, startWithoutStudio: true };
    const resumed = startUpMode({ ...wished, lastMode: remote });
    expect(resumed).toEqual(remote);
    expect(ignoredNoStudio(resumed, true)).toBe(true);
    expect(ignoredNoStudio(startUpMode(wished), true)).toBe(true);
    // The stored setting alone is nothing to report: it waits for local mode.
    expect(ignoredNoStudio(resumed, false)).toBe(false);
    expect(
      ignoredNoStudio(
        startUpMode({ ...wished, lastMode: { kind: "local" } }),
        true,
      ),
    ).toBe(false);
  });
});
