import { describe, expect, it } from "vitest";

import { startUpMode, studioUrlFromArgv } from "./start-up-mode.ts";

const remote = {
  kind: "remote",
  origin: "http://10.0.0.5:4800",
  name: "Difracta on stage-pc",
} as const;
const nothing = {
  requestedFile: undefined,
  studioUrl: undefined,
  lastMode: undefined,
};

describe("start-up mode", () => {
  it("asks on the very first launch", () => {
    expect(startUpMode(nothing)).toEqual({ kind: "launch-page" });
  });

  it("resumes the mode of the last launch", () => {
    expect(startUpMode({ ...nothing, lastMode: { kind: "local" } })).toEqual({
      kind: "local",
      file: undefined,
    });
    expect(startUpMode({ ...nothing, lastMode: remote })).toEqual(remote);
  });

  it("opens a file on this computer whatever the last mode was", () => {
    const requestedFile = "/shows/tonight.difracta";
    for (const lastMode of [undefined, { kind: "local" } as const, remote])
      expect(startUpMode({ ...nothing, requestedFile, lastMode })).toEqual({
        kind: "local",
        file: requestedFile,
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
});
