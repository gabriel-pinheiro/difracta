import path from "node:path";
import { describe, expect, it } from "vitest";

import { configFromEnvironment } from "./config.ts";

describe("runtime config", () => {
  it("is pinned by default and takes its file from the argument or DIFRACTA_FILE", () => {
    expect(configFromEnvironment(["show.difracta"], {})).toMatchObject({
      documents: "pinned",
      openPath: path.resolve("show.difracta"),
    });
    expect(
      configFromEnvironment([], { DIFRACTA_FILE: "/shows/env.difracta" }),
    ).toMatchObject({ documents: "pinned", openPath: "/shows/env.difracta" });
    // The argument wins.
    expect(
      configFromEnvironment(["/shows/arg.difracta"], {
        DIFRACTA_FILE: "/shows/env.difracta",
      }).openPath,
    ).toBe("/shows/arg.difracta");
  });

  it("refuses to start pinned without a file", () => {
    expect(() => configFromEnvironment([], {})).toThrow(/DIFRACTA_FILE/);
    expect(() => configFromEnvironment([], { DIFRACTA_FILE: "" })).toThrow(
      /DIFRACTA_FILE/,
    );
  });

  it("starts free with or without a file", () => {
    expect(configFromEnvironment(["--documents", "free"], {})).toMatchObject({
      documents: "free",
      openPath: undefined,
    });
    expect(
      configFromEnvironment(["--documents", "free", "/shows/a.difracta"], {})
        .openPath,
    ).toBe("/shows/a.difracta");
  });

  it("rejects an unknown mode and a second file", () => {
    expect(() => configFromEnvironment(["--documents", "open"], {})).toThrow(
      /pinned.*free/,
    );
    expect(() =>
      configFromEnvironment(["a.difracta", "b.difracta"], {}),
    ).toThrow(/at most one/);
  });
});
