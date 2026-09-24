import { describe, expect, it } from "vitest";

import { x11Relaunch } from "./ozone-platform.ts";

const electron = "/repo/node_modules/electron/dist/electron";
const development = [electron, "/repo/difracta-desktop"];

describe("starting Desktop again on X11", () => {
  it("is for Linux only", () => {
    for (const platform of ["darwin", "win32"] as const)
      expect(
        x11Relaunch({ platform, argv: development, env: {}, packaged: false }),
      ).toBeUndefined();
  });

  it("gives way to a platform the command line names", () => {
    for (const named of [
      "--ozone-platform=x11",
      "--ozone-platform=wayland",
      "--ozone-platform",
      "--ozone-platform-hint=auto",
    ])
      expect(
        x11Relaunch({
          platform: "linux",
          argv: [...development, named],
          env: {},
          packaged: false,
        }),
      ).toBeUndefined();
  });

  it("runs a development launch again with the switch first and every argument kept", () => {
    expect(
      x11Relaunch({
        platform: "linux",
        argv: [
          ...development,
          "--no-sandbox",
          "--no-studio",
          "show.difracta",
          "--studio-url",
          "http://127.0.0.1:4802",
        ],
        env: {},
        packaged: false,
      }),
    ).toEqual({
      command: electron,
      args: [
        "--ozone-platform=x11",
        "/repo/difracta-desktop",
        "--no-sandbox",
        "--no-studio",
        "show.difracta",
        "--studio-url",
        "http://127.0.0.1:4802",
      ],
    });
  });

  it("runs an AppImage from its file, not from the mount it made", () => {
    expect(
      x11Relaunch({
        platform: "linux",
        argv: ["/tmp/.mount_Difracta/difracta", "show.difracta"],
        env: { APPIMAGE: "/home/ana/Difracta.AppImage" },
        packaged: true,
      }),
    ).toEqual({
      command: "/home/ana/Difracta.AppImage",
      args: ["--ozone-platform=x11", "show.difracta"],
    });
  });

  it("runs an unpacked build from its executable, whatever $APPIMAGE says", () => {
    expect(
      x11Relaunch({
        platform: "linux",
        argv: ["/opt/Difracta/difracta"],
        env: { APPIMAGE: "" },
        packaged: true,
      }),
    ).toEqual({
      command: "/opt/Difracta/difracta",
      args: ["--ozone-platform=x11"],
    });
    expect(
      x11Relaunch({
        platform: "linux",
        argv: development,
        env: { APPIMAGE: "/home/ana/Difracta.AppImage" },
        packaged: false,
      }),
    ).toMatchObject({ command: electron });
  });
});
