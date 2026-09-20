import { settings } from "@difracta/core";
import { describe, expect, it } from "vitest";

import {
  runtimeArguments,
  runtimeEnvironment,
  runtimeLocations,
  runtimePort,
} from "./runtime-launch.ts";

const locations = runtimeLocations("/app/dist");

describe("runtime launch", () => {
  it("starts free on every interface, with the file last when there is one", () => {
    expect(runtimeArguments({ port: 4800, file: undefined })).toEqual([
      "--documents",
      "free",
      "--host",
      "0.0.0.0",
      "--port",
      "4800",
    ]);
    expect(
      runtimeArguments({ port: 4811, file: "/shows/a.difracta" }).slice(-3),
    ).toEqual(["--port", "4811", "/shows/a.difracta"]);
  });

  it("takes its port from DIFRACTA_PORT when that is a port", () => {
    expect(runtimePort({})).toBe(settings.runtime.port);
    expect(runtimePort({ DIFRACTA_PORT: "4811" })).toBe(4811);
    expect(runtimePort({ DIFRACTA_PORT: "" })).toBe(settings.runtime.port);
    expect(runtimePort({ DIFRACTA_PORT: "show" })).toBe(settings.runtime.port);
    expect(runtimePort({ DIFRACTA_PORT: "70000" })).toBe(settings.runtime.port);
  });

  it("points the runtime at the built pieces next to main.js", () => {
    expect(locations.script).toBe("/app/dist/runtime.mjs");
    expect(runtimeEnvironment({}, locations)).toEqual({
      DIFRACTA_STUDIO_DIST: "/app/dist/studio",
      DIFRACTA_OUTPUT_DIST: "/app/dist/output",
      DIFRACTA_THUMBNAILS_DIR: "/app/dist/thumbnails",
    });
  });

  it("inherits the environment but not the file, host and port, nor a location", () => {
    const env = runtimeEnvironment(
      {
        PATH: "/usr/bin",
        DIFRACTA_NO_OSC: "1",
        DIFRACTA_FILE: "/shows/other.difracta",
        DIFRACTA_HOST: "127.0.0.1",
        DIFRACTA_PORT: "4811",
        DIFRACTA_STUDIO_DIST: "/elsewhere",
        UNSET: undefined,
      },
      locations,
    );
    expect(env).toMatchObject({ PATH: "/usr/bin", DIFRACTA_NO_OSC: "1" });
    expect(env.DIFRACTA_STUDIO_DIST).toBe("/app/dist/studio");
    for (const gone of ["DIFRACTA_FILE", "DIFRACTA_HOST", "DIFRACTA_PORT"])
      expect(env).not.toHaveProperty(gone);
    expect(env).not.toHaveProperty("UNSET");
  });
});
