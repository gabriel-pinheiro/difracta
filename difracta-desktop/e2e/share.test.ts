import type { ShareStopResult } from "@difracta/protocol";
import { readdir } from "node:fs/promises";
import { hostname } from "node:os";
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
  launchToPage,
  menuItems,
  standaloneRuntime,
  useDesktop,
  windowAfter,
} from "./harness.ts";
import {
  answerDialogs,
  askedDialogs,
  health,
  requestFromElsewhere,
  runtimeChildPid,
} from "./running-app.ts";
import {
  closeShareWindow,
  greenWindow,
  middlePixel,
  openShareWindow,
  shareTheScreen,
  shareWindows,
  SLOT,
  slotIs,
  slotLive,
  SOFTWARE_WEBGL,
  stage,
} from "./sharing.ts";

useDesktop();

describe("Difracta Desktop as a Sharer", () => {
  it("shares the screen into a slot from the share window, and an Output of this Desktop shows it", async () => {
    const port = env.DIFRACTA_PORT;
    const studio = await launch(await installationFile("Show"), SOFTWARE_WEBGL);
    await studio.waitForFunction(() => document.title.startsWith("Show"));
    await stage(port);
    expect(await menuItems("file")).toContainEqual([
      "desktop:share-screen",
      true,
    ]);

    const page = await openShareWindow();
    await page.getByTestId("share-where").getByText("“Show”").waitFor();
    await shareTheScreen(page, port);
    expect(await slotLive(port)).toMatchObject({
      status: "live",
      sharer: hostname(),
      source: "screen",
    });
    // Asking again brings the same window to the front.
    await clickMenu("desktop:share-screen");
    expect(await shareWindows()).toEqual([{ visible: true }]);

    // An Output page in a window of this Desktop is a Viewer like any other.
    const output = await windowAfter(() =>
      studio.evaluate(() => {
        window.open("/output/?output=wall");
      }),
    );
    await page
      .getByTestId("share-viewers")
      .getByText("1 Viewer connected")
      .waitFor();
    await eventually(
      () => slotLive(port),
      (live) => "viewers" in live && live.viewers === 1,
    );

    // The picture, sent from a share window that is hidden: a green window
    // on the screen, and the Layer cropped to the inside of it.
    await closeShareWindow();
    await eventually(shareWindows, ([window]) => window?.visible === false);
    const screen = await greenWindow();
    for (const [side, value] of [
      ["cropLeft", 100 / screen.width],
      ["cropTop", 100 / screen.height],
      ["cropRight", 1 - 300 / screen.width],
      ["cropBottom", 1 - 200 / screen.height],
    ] as const)
      await commandFromElsewhere(port, "address.edit", {
        address: `layer/share/param/${side}`,
        // The Parameter's step.
        value: Math.round(value / 0.0005) * 0.0005,
      });
    const [red, green, blue] = await eventually(
      () => middlePixel(output),
      ([r = 0, g = 0, b = 0]) => g > 180 && r < 90 && b < 90,
    );
    expect([red, green, blue]).toHaveLength(3);

    // Stop, from the window: the slot is idle and the window is back on the start flow.
    await clickMenu("desktop:share-screen");
    await eventually(shareWindows, ([window]) => window?.visible === true);
    await page.getByRole("button", { name: "Stop" }).click();
    await slotIs(port, "idle");
    await page.getByTestId("share-start").waitFor();
    expect(await page.getByTestId("share-row").count()).toBe(0);
  });

  it("goes on sharing behind a closed window, and says so when another client stops the share", async () => {
    const port = env.DIFRACTA_PORT;
    const studio = await launch(await installationFile("Show"));
    await studio.waitForFunction(() => document.title.startsWith("Show"));
    await stage(port);
    const page = await openShareWindow();
    await shareTheScreen(page, port);

    // Closing hides: the share goes on, and the menu brings the window back.
    await closeShareWindow();
    await eventually(shareWindows, ([window]) => window?.visible === false);
    expect((await slotLive(port)).status).toBe("live");
    await clickMenu("desktop:share-screen");
    await eventually(shareWindows, ([window]) => window?.visible === true);
    await page.getByTestId("share-row").waitFor();

    // As `difracta share stop` does.
    expect(
      await requestFromElsewhere<ShareStopResult, "shares.stop">(
        port,
        "shares.stop",
        { mediaId: SLOT },
      ),
    ).toEqual({ mediaId: SLOT, sharer: hostname() });
    await page.getByRole("alert").filter({ hasText: "Laptop" }).waitFor();
    await page.getByTestId("share-start").waitFor();
    expect((await slotLive(port)).status).toBe("idle");

    // With nothing shared, closing closes.
    await page.close();
    await eventually(shareWindows, (windows) => windows.length === 0);
  });

  it("adds a Screen Share to an Installation that has none", async () => {
    const port = env.DIFRACTA_PORT;
    const studio = await launch(await installationFile("Bare"));
    await studio.waitForFunction(() => document.title.startsWith("Bare"));
    const page = await openShareWindow();
    await page.getByText("has no Screen Share yet").waitFor();
    expect(
      await page
        .getByRole("button", { name: "Choose what to share…" })
        .isDisabled(),
    ).toBe(true);
    await page.getByRole("button", { name: "Add a Screen Share" }).click();
    await page
      .getByTestId("share-slot")
      .filter({ hasText: "Screen Share" })
      .waitFor();
    expect(
      await page
        .getByRole("button", { name: "Choose what to share…" })
        .isEnabled(),
    ).toBe(true);
    expect(port).toBeDefined();
  });

  it("shares into a runtime elsewhere, and asks before quitting while it does", async () => {
    const port = await standaloneRuntime(await installationFile("Elsewhere"));
    await stage(port);
    const launchPage = await launchToPage();
    const address = launchPage.getByRole("textbox");
    await address.fill(`127.0.0.1:${String(port)}`);
    const studio = await windowAfter(() => address.press("Enter"));
    await studio.waitForFunction(() => document.title.startsWith("Elsewhere"));

    const page = await openShareWindow();
    await page.getByTestId("share-where").getByText("“Elsewhere”").waitFor();
    await shareTheScreen(page, port);

    // Cancel stays, and the share goes on.
    await answerDialogs(1);
    await app?.evaluate(({ app: electronApp }) => electronApp.quit());
    await eventually(askedDialogs, (asked) => asked.length === 1);
    expect(await askedDialogs()).toEqual([
      "This computer is sharing its screen into 1 Screen Share. Quitting stops it. Quit/Cancel",
    ]);
    expect((await slotLive(port)).status).toBe("live");
    expect(await shareWindows()).toHaveLength(1);

    // Quit stops it: the runtime hears the share ended, not a connection that dropped.
    await answerDialogs(0);
    const desktop = app?.process();
    const exited = new Promise((resolve) => desktop?.once("exit", resolve));
    await app
      ?.evaluate(({ app: electronApp }) => electronApp.quit())
      .catch(() => undefined);
    await exited;
    expect((await slotLive(port)).status).toBe("idle");
  });

  it("stops sharing, after asking, when Desktop leaves the runtime for another", async () => {
    const port = await standaloneRuntime(await installationFile("Elsewhere"));
    await stage(port);
    const launchPage = await launchToPage();
    const address = launchPage.getByRole("textbox");
    await address.fill(`127.0.0.1:${String(port)}`);
    const studio = await windowAfter(() => address.press("Enter"));
    await studio.waitForFunction(() => document.title.startsWith("Elsewhere"));
    const page = await openShareWindow();
    await shareTheScreen(page, port);
    // Hidden, as it is through a show.
    await closeShareWindow();
    await eventually(shareWindows, ([window]) => window?.visible === false);

    const chooser = await windowAfter(() => clickMenu("desktop:connect-to"));
    const run = chooser.getByRole("button", { name: "Run on this computer" });
    // Cancel stays with the runtime, and the share goes on.
    await answerDialogs(1);
    // Cancel closes the launch page, which may be while the click is still returning.
    await run.click().catch(() => undefined);
    await eventually(askedDialogs, (asked) => asked.length === 1);
    expect(await askedDialogs()).toEqual([
      "This computer is sharing its screen into 1 Screen Share. Switching stops it. Switch/Cancel",
    ]);
    expect((await slotLive(port)).status).toBe("live");
    expect(studio.isClosed()).toBe(false);

    // Switch leaves: the share stopped, its window gone, Studio from this computer.
    await answerDialogs(0);
    const again = await windowAfter(() => clickMenu("desktop:connect-to"));
    const here = await windowAfter(() =>
      again
        .getByRole("button", { name: "Run on this computer" })
        .click()
        .catch(() => undefined),
    );
    await here.waitForFunction(() => document.title.startsWith("Untitled"));
    expect((await slotLive(port)).status).toBe("idle");
    expect(await shareWindows()).toEqual([]);
  });

  it("goes on sharing into a runtime that was started again", async () => {
    const port = env.DIFRACTA_PORT;
    const studio = await launch(await installationFile("Show"));
    await studio.waitForFunction(() => document.title.startsWith("Show"));
    await stage(port);
    // The slot comes back with the runtime from its autosave.
    await eventually(
      () => readdir(dir),
      (files) => files.some((name) => name.endsWith(".autosave.difracta")),
    );
    const page = await openShareWindow();
    await shareTheScreen(page, port);
    const before = await slotLive(port);

    const pid = await runtimeChildPid();
    if (pid === undefined) throw new Error("No runtime child.");
    process.kill(pid, "SIGKILL");
    await eventually(runtimeChildPid, (next) => next !== pid);
    await eventually(health, (ok) => ok);

    // The page declared its share again by itself: a new share of the same capture.
    const after = await slotIs(port, "live");
    expect(after).toMatchObject({ sharer: hostname(), source: "screen" });
    expect("since" in after && "since" in before && after.since).not.toBe(
      "since" in before && before.since,
    );
    expect(await page.getByTestId("share-row").count()).toBe(1);
    expect(await page.getByRole("alert").count()).toBe(0);
  });
});
