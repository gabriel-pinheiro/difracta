import path from "node:path";
import { describe, expect, it } from "vitest";

import { documentFileFromArgv, startUpFile } from "./start-up-file.ts";

describe("document file from argv", () => {
  it("finds the .difracta file among switches, wherever it sits", () => {
    expect(
      documentFileFromArgv(
        ["/opt/Difracta/difracta", "/shows/a.difracta"],
        "/",
      ),
    ).toBe("/shows/a.difracta");
    // Development: electron, the app folder, then the file.
    expect(
      documentFileFromArgv(["electron", ".", "/shows/a.difracta"], "/"),
    ).toBe("/shows/a.difracta");
    // A second launch arrives with Chromium's own switches mixed in.
    expect(
      documentFileFromArgv(
        ["difracta", "--allow-file-access", "/shows/A.DIFRACTA", "--enable"],
        "/",
      ),
    ).toBe("/shows/A.DIFRACTA");
  });

  it("resolves a relative path against the launch directory", () => {
    expect(documentFileFromArgv(["difracta", "b.difracta"], "/shows")).toBe(
      path.resolve("/shows", "b.difracta"),
    );
  });

  it("is undefined without one, and never the executable itself", () => {
    expect(documentFileFromArgv(["difracta"], "/")).toBeUndefined();
    expect(documentFileFromArgv(["difracta", ".", "--x"], "/")).toBeUndefined();
    expect(
      documentFileFromArgv(["/apps/my.difracta", "--flag=a.difracta"], "/"),
    ).toBeUndefined();
  });
});

describe("start-up file", () => {
  const exists = (present: boolean) => () => Promise.resolve(present);

  it("prefers the requested file, even a missing one", async () => {
    expect(
      await startUpFile({
        requested: "/a.difracta",
        last: "/b.difracta",
        exists: exists(false),
      }),
    ).toBe("/a.difracta");
  });

  it("falls back to the last file only while it exists", async () => {
    const options = { requested: undefined, last: "/b.difracta" };
    expect(await startUpFile({ ...options, exists: exists(true) })).toBe(
      "/b.difracta",
    );
    expect(
      await startUpFile({ ...options, exists: exists(false) }),
    ).toBeUndefined();
    expect(
      await startUpFile({
        requested: undefined,
        last: undefined,
        exists: exists(true),
      }),
    ).toBeUndefined();
  });
});
