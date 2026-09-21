import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  app,
  clickMenu,
  commandFromElsewhere,
  dir,
  env,
  eventually,
  installationFile,
  launch,
  launchWithoutStudio,
  quit,
  renameFromElsewhere,
  secondLaunch,
  studioTitle,
  userData,
  windowAfter,
  useDesktop,
} from "./harness.ts";
import {
  answerDialogs,
  askedDialogs,
  attachedOutputSessions,
  health,
  menuChecked,
  openInstallationName,
  runtimeChildPid,
  windowCount,
} from "./running-app.ts";

useDesktop();

const SOFTWARE_WEBGL = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
];

const runtimeLog = (): Promise<string> =>
  readFile(path.join(userData, "logs", "runtime.log"), "utf8");

describe("Difracta Desktop as an appliance", () => {
  it("runs without the Studio window, shows it to a second launch, and stops on SIGTERM", async () => {
    await launchWithoutStudio(await installationFile("First"));
    expect(await windowCount()).toBe(0);
    expect(await openInstallationName(env.DIFRACTA_PORT)).toBe("First");

    // A file from the OS has no Studio to go through: the runtime opens it.
    await secondLaunch(await installationFile("Second"));
    await eventually(
      () => openInstallationName(env.DIFRACTA_PORT),
      (name) => name === "Second",
    );
    expect(await windowCount()).toBe(0);

    // Started again by hand, Studio shows.
    const page = await windowAfter(() => secondLaunch());
    await page.waitForFunction(() => document.title.startsWith("Second"));

    // File ▸ Startup: the login entry is what is running, under the test's
    // own XDG_CONFIG_HOME, and follows the other checkbox.
    const entry = path.join(
      dir,
      "config",
      "autostart",
      "difracta-desktop.desktop",
    );
    await eventually(
      () => menuChecked("desktop:start-at-login"),
      (checked) => checked === false,
    );
    await clickMenu("desktop:start-at-login");
    const exec = (
      await eventually(
        () => readFile(entry, "utf8"),
        (text) => text.includes("Exec="),
      )
    )
      .split("\n")
      .find((line) => line.startsWith("Exec="));
    expect(exec).toContain(path.dirname(import.meta.dirname));
    expect(exec).not.toContain("--no-studio");
    await eventually(
      () => menuChecked("desktop:start-at-login"),
      (checked) => checked === true,
    );

    await answerDialogs(0);
    await clickMenu("desktop:start-without-studio");
    await eventually(
      () => readFile(entry, "utf8"),
      (text) => /^Exec=.* --no-studio$/m.test(text),
    );
    expect((await askedDialogs())[0]).toContain(
      "Difracta will start without its Studio window.",
    );
    expect(
      JSON.parse(
        await readFile(path.join(userData, "desktop-state.json"), "utf8"),
      ),
    ).toMatchObject({ startWithoutStudio: true });
    await clickMenu("desktop:start-at-login");
    await eventually(
      () => readdir(path.dirname(entry)),
      (files) => files.length === 0,
    );

    // The window was a visit: closing it leaves the runtime running.
    await page.close();
    await eventually(windowCount, (count) => count === 0);
    expect(await health()).toBe(true);

    // Nobody is there to answer a dialog, so SIGTERM just stops it, runtime first.
    const desktop = app?.process();
    const exited = new Promise((resolve) => desktop?.once("exit", resolve));
    desktop?.kill("SIGTERM");
    await exited;
    expect(await runtimeLog()).toContain("Stopping Difracta Runtime");
    expect(await health()).toBe(false);
  });

  it("starts the runtime again when it dies, with the Installation that was open and its unsaved changes", async () => {
    const file = await installationFile("Tonight");
    const page = await launch(file);
    await page.waitForFunction(() => document.title.startsWith("Tonight"));

    // An unsaved change, old enough to have been autosaved.
    await renameFromElsewhere(env.DIFRACTA_PORT, "Changed");
    await eventually(
      () => readdir(dir),
      (files) => files.some((name) => name.endsWith(".autosave.difracta")),
    );

    const pid = await runtimeChildPid();
    if (pid === undefined) throw new Error("No runtime child.");
    process.kill(pid, "SIGKILL");

    await eventually(runtimeChildPid, (next) => next !== pid);
    await eventually(health, (ok) => ok);
    expect(await openInstallationName(env.DIFRACTA_PORT)).toBe("Changed");
    expect(await runtimeLog()).toContain("Restarting it in");

    // Studio's page and main's own link both found the new runtime by
    // themselves: a change made now reaches the page and the title main writes.
    await renameFromElsewhere(env.DIFRACTA_PORT, "After");
    await page.waitForFunction(() => document.title.startsWith("After"));
    await eventually(studioTitle, (title) => title?.includes("After") === true);
    // Not only the summary: Studio follows the Installation itself again.
    await commandFromElsewhere(env.DIFRACTA_PORT, "output.create", {
      name: "Made after the restart",
    });
    await page.getByText("Made after the restart").first().waitFor();

    await answerDialogs(1);
    await quit();
  });

  it("warns before quitting turns Outputs dark, and Cancel keeps everything running", async () => {
    // An Output page attaches once it can draw, which under Xvfb takes
    // Chromium's software WebGL.
    const page = await launch(await installationFile("Show"), SOFTWARE_WEBGL);
    await page.waitForFunction(() => document.title.startsWith("Show"));
    // An unsaved change too: an Output, shown in a window of Desktop's.
    await commandFromElsewhere(env.DIFRACTA_PORT, "output.create", {
      id: "wall",
      name: "Wall",
    });
    await windowAfter(() =>
      page.evaluate(() => {
        window.open(`${location.origin}/output/?output=wall`);
      }),
    );
    await eventually(
      () => attachedOutputSessions(env.DIFRACTA_PORT),
      (count) => count === 1,
    );

    // Unsaved changes first (Don't Save), then the Outputs; Cancel there
    // keeps the runtime, the windows and the unsaved Installation.
    await app?.evaluate(({ dialog }) => {
      const asked: string[] = [];
      (globalThis as { asked?: string[] }).asked = asked;
      dialog.showMessageBox = (...args: unknown[]) => {
        const options = args[1] as {
          message: string;
          detail: string;
          buttons: string[];
        };
        asked.push(
          `${options.message} ${options.detail} ${options.buttons.join("/")}`,
        );
        return Promise.resolve({ response: 1, checkboxChecked: false });
      };
    });
    await app?.evaluate(({ app: electronApp }) => electronApp.quit());
    await eventually(askedDialogs, (asked) => asked.length === 2);
    expect(await askedDialogs()).toEqual([
      "Save the changes to “Show”? Your changes are lost if you do not save them. Save/Don't Save/Cancel",
      "1 Output is showing from this computer. Quitting stops it. Quit/Cancel",
    ]);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await health()).toBe(true);
    expect(await windowCount()).toBe(2);
    expect(await openInstallationName(env.DIFRACTA_PORT)).toBe("Show");

    // Closing the Studio window asks the same; Quit goes through with it.
    await app?.evaluate(({ dialog }) => {
      dialog.showMessageBox = (...args: unknown[]) => {
        const { buttons } = args[1] as { buttons: string[] };
        // Don't Save, then Quit.
        return Promise.resolve({
          response: buttons.includes("Quit") ? 0 : 1,
          checkboxChecked: false,
        });
      };
    });
    const desktop = app?.process();
    const exited = new Promise((resolve) => desktop?.once("exit", resolve));
    await app
      ?.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()
          .find((window) => window.webContents.getURL().includes("/studio/"))
          ?.close();
      })
      .catch(() => undefined);
    await exited;
    expect(await health()).toBe(false);
  });
});
