import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  autostartCommand,
  autostartDirectory,
  autostartEntry,
  XdgAutostart,
} from "./xdg-autostart.ts";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "difracta-autostart-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("XDG autostart", () => {
  it("looks under XDG_CONFIG_HOME, else under ~/.config", () => {
    expect(autostartDirectory({}, "/home/ana")).toBe(
      "/home/ana/.config/autostart",
    );
    expect(autostartDirectory({ XDG_CONFIG_HOME: "" }, "/home/ana")).toBe(
      "/home/ana/.config/autostart",
    );
    expect(autostartDirectory({ XDG_CONFIG_HOME: "/cfg" }, "/home/ana")).toBe(
      "/cfg/autostart",
    );
  });

  it("starts what is running now, with the sandbox switch only when this launch has it", () => {
    expect(
      autostartCommand({
        execPath: "/opt/Difracta/difracta",
        appPath: undefined,
        appImage: undefined,
        noSandbox: false,
        noStudio: false,
      }),
    ).toEqual(["/opt/Difracta/difracta"]);
    expect(
      autostartCommand({
        execPath: "/repo/node_modules/electron/dist/electron",
        appPath: "/repo/difracta-desktop",
        appImage: undefined,
        noSandbox: true,
        noStudio: true,
      }),
    ).toEqual([
      "/repo/node_modules/electron/dist/electron",
      "/repo/difracta-desktop",
      "--no-sandbox",
      "--no-studio",
    ]);
  });

  it("starts an AppImage from its file, and leaves the sandbox switch to its launcher", () => {
    expect(
      autostartCommand({
        execPath: "/tmp/.mount_DifracXYZ/difracta",
        appPath: undefined,
        appImage: "/home/ana/Apps/Difracta-1.2.3-x86_64.AppImage",
        noSandbox: true,
        noStudio: false,
      }),
    ).toEqual(["/home/ana/Apps/Difracta-1.2.3-x86_64.AppImage"]);
    expect(
      autostartCommand({
        execPath: "/tmp/.mount_DifracXYZ/difracta",
        appPath: undefined,
        appImage: "/home/ana/Apps/Difracta-1.2.3-x86_64.AppImage",
        noSandbox: true,
        noStudio: true,
      }),
    ).toEqual(["/home/ana/Apps/Difracta-1.2.3-x86_64.AppImage", "--no-studio"]);
    // An empty variable is no AppImage.
    expect(
      autostartCommand({
        execPath: "/opt/Difracta/difracta",
        appPath: undefined,
        appImage: "",
        noSandbox: false,
        noStudio: false,
      }),
    ).toEqual(["/opt/Difracta/difracta"]);
  });

  it("writes an entry whose Exec is the command, quoted where the format asks", () => {
    expect(
      autostartEntry([
        "/opt/Difracta/difracta",
        "/home/ana/My Shows/app",
        "--no-sandbox",
        "--no-studio",
      ]),
    ).toBe(
      [
        "[Desktop Entry]",
        "Type=Application",
        "Name=Difracta",
        "Comment=Start Difracta Desktop at login",
        'Exec=/opt/Difracta/difracta "/home/ana/My Shows/app" --no-sandbox --no-studio',
        "Terminal=false",
        "",
      ].join("\n"),
    );
    expect(autostartEntry(['/odd/$HOME "50%"'])).toContain(
      'Exec="/odd/\\$HOME \\"50%%\\""',
    );
  });

  it("is enabled while its file is there, and rewrites it on a new command", async () => {
    const autostart = new XdgAutostart(path.join(dir, "autostart"));
    expect(await autostart.enabled()).toBe(false);

    await autostart.enable(["/opt/difracta"]);
    expect(await autostart.enabled()).toBe(true);
    expect(await readdir(path.join(dir, "autostart"))).toEqual([
      "difracta-desktop.desktop",
    ]);

    await autostart.enable(["/opt/difracta", "--no-studio"]);
    expect(
      await readFile(
        path.join(dir, "autostart", "difracta-desktop.desktop"),
        "utf8",
      ),
    ).toContain("Exec=/opt/difracta --no-studio\n");

    await autostart.disable();
    expect(await autostart.enabled()).toBe(false);
    // Removing what is not there is fine.
    await autostart.disable();
  });
});
