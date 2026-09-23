import type { DisplayActionResult } from "@difracta/protocol";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  app,
  commandFromElsewhere,
  env,
  eventually,
  installationFile,
  launch,
  launchToPage,
  launchWithoutStudio,
  standaloneRuntime,
  studioTitle,
  userData,
  useDesktop,
  windowAfter,
} from "./harness.ts";
import {
  answerDialogs,
  askedDialogs,
  attachedOutputSessions,
  displayHosts,
  displayWindows,
  health,
  requestFromElsewhere,
  windowCount,
} from "./running-app.ts";

useDesktop();

// An Output page attaches once it can draw, which under Xvfb takes Chromium's software WebGL.
const SOFTWARE_WEBGL = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
];

/** The Installation's placements Desktop keeps, from its state file. */
async function savedPlacements(): Promise<{ output: string }[]> {
  const state = JSON.parse(
    await readFile(path.join(userData, "desktop-state.json"), "utf8"),
  ) as { displayMappings?: Record<string, { output: string }[]> };
  return Object.values(state.displayMappings ?? {}).flat();
}

/** The one connected host, once it has offered its Displays. */
async function theHost(port: string | number | undefined) {
  const hosts = await eventually(
    () => displayHosts(port),
    (all) => all.length === 1 && all[0]?.displays.length === 1,
  );
  const [host] = hosts;
  if (host === undefined) throw new Error("No Display Host.");
  return host;
}

/** Esc on the Display window, sent from main as the keyboard would. */
async function pressEscapeOnDisplayWindow(): Promise<void> {
  await app?.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows().find((window) =>
      window.webContents.getURL().includes("/output/"),
    )?.webContents;
    contents?.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
    contents?.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
  });
}

describe("Difracta Desktop as a Display Host", () => {
  it("offers its Displays, shows and hides Outputs on them, and lights them again at the next start", async () => {
    const file = await installationFile("Show");
    const port = env.DIFRACTA_PORT;
    const page = await launch(file, SOFTWARE_WEBGL);
    await page.waitForFunction(() => document.title.startsWith("Show"));
    for (const [id, name] of [
      ["wall", "Wall"],
      ["floor", "Floor"],
    ])
      await commandFromElsewhere(port, "output.create", { id, name });

    // Xvfb has one Display, which the host numbers 1.
    const host = await theHost(port);
    expect(host.displays[0]).toMatchObject({ id: "1", primary: true });
    expect(host.showing).toEqual({});

    // From Studio's Open Output dialog, which lists that Display under its host.
    await page.getByText("Wall").first().click();
    await page
      .getByTestId("inspector")
      .getByRole("button", { name: "Open", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText(host.name).waitFor();
    await dialog.getByText("shows nothing").waitFor();
    await dialog.getByRole("button", { name: "Show", exact: true }).click();
    await dialog.getByText("shows this Output").waitFor();

    // It covers the Display. Xvfb has no window manager, so whether it is
    // full screen and above everything is not something to ask here.
    const bounds = host.displays[0]?.bounds ?? { width: 0, height: 0 };
    const [shown] = await eventually(
      displayWindows,
      (windows) => windows.length === 1,
    );
    expect(shown?.url).toBe(
      `http://127.0.0.1:${port ?? ""}/output/?output=wall`,
    );
    expect(shown?.width).toBeGreaterThanOrEqual(bounds.width);
    expect(shown?.height).toBeGreaterThanOrEqual(bounds.height);
    expect((await theHost(port)).showing).toEqual({ "1": "wall" });
    await eventually(
      () => attachedOutputSessions(port),
      (count) => count === 1,
    );
    await eventually(savedPlacements, (all) => all.length === 1);

    // Another Output on the same Display takes its place, in the same window.
    expect(
      await requestFromElsewhere<DisplayActionResult, "displays.show">(
        port,
        "displays.show",
        { host: host.id, display: "1", output: "floor" },
      ),
    ).toEqual({ host: host.id, display: "1", output: "floor" });
    await eventually(displayWindows, (windows) =>
      windows.every((window) => window.url.endsWith("output=floor")),
    );
    expect(await windowCount()).toBe(2);
    expect((await theHost(port)).showing).toEqual({ "1": "floor" });

    // Hide closes it and forgets the placement; hiding again is fine.
    await dialog.getByRole("button", { name: "Hide", exact: true }).click();
    await dialog.getByText("shows nothing").waitFor();
    await eventually(displayWindows, (windows) => windows.length === 0);
    await eventually(savedPlacements, (all) => all.length === 0);
    await requestFromElsewhere(port, "displays.hide", {
      host: host.id,
      display: "1",
    });
    await expect(
      requestFromElsewhere(port, "displays.hide", {
        host: host.id,
        display: "7",
      }),
    ).rejects.toThrow();

    // Shown again and saved, then quit: the warning counts it, Cancel keeps it.
    await requestFromElsewhere(port, "displays.show", {
      host: host.id,
      display: "1",
      output: "wall",
    });
    await page.keyboard.press("Escape");
    await eventually(studioTitle, (title) => title?.startsWith("* ") === true);
    await page.keyboard.press("Control+s");
    await eventually(
      studioTitle,
      (title) => title?.startsWith("Show") === true,
    );
    await eventually(
      () => attachedOutputSessions(port),
      (count) => count === 1,
    );
    await answerDialogs(1);
    await app?.evaluate(({ app: electronApp }) => electronApp.quit());
    await eventually(askedDialogs, (asked) => asked.length === 1);
    expect(await askedDialogs()).toEqual([
      "1 Output is showing from this computer. Quitting stops it. Quit/Cancel",
    ]);
    expect(await displayWindows()).toHaveLength(1);

    await answerDialogs(0);
    const desktop = app?.process();
    const exited = new Promise((resolve) => desktop?.once("exit", resolve));
    await app
      ?.evaluate(({ app: electronApp }) => electronApp.quit())
      .catch(() => undefined);
    await exited;
    // Quitting is not hiding.
    expect(await savedPlacements()).toHaveLength(1);

    // The next start lights the Display again, with no Studio window at all.
    await launchWithoutStudio(file);
    await eventually(displayWindows, (windows) => windows.length === 1);
    expect((await displayWindows())[0]?.url).toContain("output=wall");
    expect(await windowCount()).toBe(1);
    expect((await theHost(port)).showing).toEqual({ "1": "wall" });

    // Esc is the way out for a person in front of it. Closing the only
    // window of a Desktop without Studio quits nothing.
    await pressEscapeOnDisplayWindow();
    await eventually(windowCount, (count) => count === 0);
    expect((await theHost(port)).showing).toEqual({});
    await eventually(savedPlacements, (all) => all.length === 0);
    expect(await health()).toBe(true);
  });

  it("shows the Outputs of a runtime elsewhere, and says so before leaving it", async () => {
    const port = await standaloneRuntime(await installationFile("Elsewhere"));
    await commandFromElsewhere(String(port), "output.create", {
      id: "wall",
      name: "Wall",
    });
    const launchPage = await launchToPage();
    const address = launchPage.getByRole("textbox");
    await address.fill(`127.0.0.1:${port}`);
    const page = await windowAfter(() => address.press("Enter"));
    await page.waitForFunction(() => document.title.startsWith("Elsewhere"));

    const host = await theHost(port);
    await requestFromElsewhere(port, "displays.show", {
      host: host.name,
      display: "1",
      output: "wall",
    });
    expect(
      (await eventually(displayWindows, (windows) => windows.length === 1)).map(
        (window) => window.url,
      ),
    ).toEqual([`http://127.0.0.1:${port}/output/?output=wall`]);

    // An Output removed from the Installation leaves its Display, and has it
    // back when it returns (an undo, here an Output of the same id).
    await commandFromElsewhere(String(port), "output.remove", {
      outputId: "wall",
    });
    await eventually(displayWindows, (windows) => windows.length === 0);
    await commandFromElsewhere(String(port), "output.create", {
      id: "wall",
      name: "Wall again",
    });
    await eventually(displayWindows, (windows) => windows.length === 1);

    await answerDialogs(1);
    await app?.evaluate(({ app: electronApp }) => electronApp.quit());
    await eventually(askedDialogs, (asked) => asked.length === 1);
    expect(await askedDialogs()).toEqual([
      "1 Display of this computer is showing an Output. Quitting stops it. Quit/Cancel",
    ]);
    expect(await displayWindows()).toHaveLength(1);

    await answerDialogs(0);
    const desktop = app?.process();
    const exited = new Promise((resolve) => desktop?.once("exit", resolve));
    await app
      ?.evaluate(({ app: electronApp }) => electronApp.quit())
      .catch(() => undefined);
    await exited;
    // The runtime goes on without the host.
    await eventually(
      () => displayHosts(port),
      (hosts) => hosts.length === 0,
    );
  });
});
