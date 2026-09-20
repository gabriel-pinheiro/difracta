import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { homedir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  LAUNCH_PAGE,
  app,
  clickMenu,
  env,
  eventually,
  installationFile,
  launch,
  launchToPage,
  menuItems,
  quit,
  renameFromElsewhere,
  secondLaunch,
  standaloneRuntime,
  stopStandalone,
  studioTitle,
  userData,
  windowAfter,
  useDesktop,
} from "./harness.ts";

useDesktop();

describe("Difracta Desktop", () => {
  it("opens the file it is launched with, in a Studio that has the bridge", async () => {
    const file = await installationFile("Tonight");
    const page = await launch(file);
    await page.waitForFunction(() => document.title.startsWith("Tonight"));

    expect(page.url()).toBe(`http://127.0.0.1:${env.DIFRACTA_PORT}/studio/`);
    expect(
      await page.evaluate(() => ({
        bridge: Object.keys(window.difractaDesktop ?? {}).sort(),
        node: typeof (globalThis as { require?: unknown }).require,
      })),
    ).toEqual({
      bridge: ["onOpenRequest", "pickOpenPath", "pickSavePath"],
      node: "undefined",
    });
    // Main writes the title: the file, the home directory as "~" when inside it.
    expect(await studioTitle()).toBe(
      `Tonight - ${file.replace(homedir(), "~")} - Difracta`,
    );

    // An Output page opened from Studio is an app window without the bridge;
    // a link to anywhere else never replaces Studio.
    const [output] = await Promise.all([
      app?.waitForEvent("window"),
      page.evaluate(() => {
        window.open(`${location.origin}/output/?output=none`);
      }),
    ]);
    await output?.waitForURL(/\/output\/\?output=none$/);
    expect(
      await output?.evaluate(() => [
        typeof window.difractaDesktop,
        typeof window.difractaMenu,
      ]),
    ).toEqual(["undefined", "undefined"]);
    // Nor a menu bar, so no key of the menu's does anything on a projector.
    expect(
      await app?.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().map((window) => [
          new URL(window.webContents.getURL()).pathname,
          window.isMenuBarVisible(),
        ]),
      ),
    ).toEqual(
      expect.arrayContaining([
        ["/studio/", true],
        ["/output/", false],
      ]),
    );
    await page.evaluate(() => {
      location.href = "http://127.0.0.1:9/elsewhere";
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(page.url()).toContain("/studio/");

    // The file is remembered for the next launch.
    const state = path.join(userData, "desktop-state.json");
    await eventually(
      () => readFile(state, "utf8"),
      (text) => (JSON.parse(text) as { lastFile?: string }).lastFile === file,
    );
  });

  it("reopens the last file, and has a second launch open its file in the first", async () => {
    const first = await installationFile("First");
    const second = await installationFile("Second");
    let page = await launch(first);
    await page.waitForFunction(() => document.title.startsWith("First"));
    await app?.close();

    page = await launch();
    await page.waitForFunction(() => document.title.startsWith("First"));

    await Promise.all([
      secondLaunch(second),
      page.waitForFunction(() => document.title.startsWith("Second")),
    ]);
  });

  it("asks about unsaved changes when its window closes, and Save saves", async () => {
    const file = await installationFile("Before");
    const page = await launch(file);
    await page.waitForFunction(() => document.title.startsWith("Before"));

    await renameFromElsewhere(env.DIFRACTA_PORT, "After");
    await page.waitForFunction(() => document.title.startsWith("After*"));

    // A native dialog cannot be clicked from here, so main's is answered for it.
    const asked = await app?.evaluate(({ dialog, BrowserWindow }) => {
      return new Promise<string>((resolve) => {
        dialog.showMessageBox = (...args: unknown[]) => {
          const options = args[1] as { message: string; buttons: string[] };
          resolve(`${options.message} ${options.buttons.join("/")}`);
          return Promise.resolve({ response: 0, checkboxChecked: false });
        };
        BrowserWindow.getAllWindows()[0]?.close();
      });
    });
    expect(asked).toBe("Save the changes to “After”? Save/Don't Save/Cancel");
    await eventually(
      () => readFile(file, "utf8"),
      (text) => text.includes('"After"'),
    );
  });

  it("asks where to run on the first launch, and runs on this computer", async () => {
    const launchPage = await launchToPage();
    expect(
      await launchPage.evaluate(() => ({
        launch: Object.keys(window.difractaLaunch ?? {}).sort(),
        desktop: typeof window.difractaDesktop,
        node: typeof (globalThis as { require?: unknown }).require,
      })),
    ).toEqual({
      launch: [
        "connect",
        "current",
        "forget",
        "onRuntimesChanged",
        "problem",
        "remembered",
        "runLocal",
        "runtimes",
      ],
      desktop: "undefined",
      node: "undefined",
    });
    // The scheme serves the launch page, not the rest of what is in dist/.
    expect(
      await launchPage.evaluate(async () =>
        Promise.all(
          [
            "/studio/index.html",
            "/main.js",
            "/studio/assets/..%2F..%2Fmain.js",
          ].map(async (url) => (await fetch(url)).status),
        ),
      ),
    ).toEqual([404, 404, 404]);

    const page = await windowAfter(() =>
      launchPage.getByRole("button", { name: "Run on this computer" }).click(),
    );
    await page.waitForFunction(() => document.title.startsWith("Untitled"));
    expect(page.url()).toBe(`http://127.0.0.1:${env.DIFRACTA_PORT}/studio/`);
    // Untouched, so not dirty: no asterisk, and quitting asks nothing.
    expect(await page.title()).toBe("Untitled – Difracta Studio");
    expect(
      await page.evaluate(() => ({
        desktop: typeof window.difractaDesktop,
        launch: typeof window.difractaLaunch,
      })),
    ).toEqual({ desktop: "object", launch: "undefined" });
    expect(await studioTitle()).toBe("Untitled - Difracta");
    await eventually(
      () => Promise.resolve(launchPage.isClosed()),
      (closed) => closed,
    );

    // Quitting stops the runtime.
    await quit();
    const log = await readFile(
      path.join(userData, "logs", "runtime.log"),
      "utf8",
    );
    expect(log).toContain("Stopping Difracta Runtime");
    await expect(
      fetch(`http://127.0.0.1:${env.DIFRACTA_PORT}/health`),
    ).rejects.toThrow();

    // The next launch runs on this computer again, without asking.
    const resumed = await launch();
    await resumed.waitForFunction(() => document.title.startsWith("Untitled"));
    expect(resumed.url()).toContain(`:${env.DIFRACTA_PORT}/studio/`);
  });

  it("connects to a runtime by address, resumes it, and marks it on the launch page", async () => {
    const port = await standaloneRuntime(await installationFile("Elsewhere"));
    const launchPage = await launchToPage();
    const address = launchPage.getByRole("textbox");

    await address.fill("not an address");
    await address.press("Enter");
    await launchPage
      .getByRole("alert")
      .filter({ hasText: "not an address" })
      .waitFor();

    // A runtime elsewhere shows its own Studio, which gets the menu bridge for
    // its menu and nothing that reaches this computer's disk or Desktop itself.
    await address.fill(`127.0.0.1:${port}`);
    let page = await windowAfter(() => address.press("Enter"));
    await page.waitForFunction(() => document.title.startsWith("Elsewhere"));
    expect(page.url()).toBe(`http://127.0.0.1:${port}/studio/`);
    expect(
      await page.evaluate(() => ({
        menu: Object.keys(window.difractaMenu ?? {}).sort(),
        desktop: typeof window.difractaDesktop,
        launch: typeof window.difractaLaunch,
        node: typeof (globalThis as { require?: unknown }).require,
      })),
    ).toEqual({
      menu: ["onFullScreenChange", "onMenuCommand", "setMenu"],
      desktop: "undefined",
      launch: "undefined",
      node: "undefined",
    });
    // Main names the runtime in the title, from its own link to it, and that
    // Studio's menu is in the native bar: a pinned runtime's, so no Open.
    await eventually(
      studioTitle,
      (title) => title === `Elsewhere - 127.0.0.1:${port} - Difracta`,
    );
    await eventually(
      () => menuItems("file"),
      (items) => items.some(([id]) => id === "page:save"),
    );
    expect((await menuItems("file")).map(([id]) => id)).not.toContain(
      "page:open",
    );
    expect((await menuItems("help")).map(([id]) => id)).not.toContain(
      "help:runtime-log",
    );
    // No runtime was started on this computer for it.
    await expect(
      fetch(`http://127.0.0.1:${env.DIFRACTA_PORT}/health`),
    ).rejects.toThrow();

    // The next launch goes straight back to it.
    await app?.close();
    page = await launch();
    await page.waitForFunction(() => document.title.startsWith("Elsewhere"));
    expect(page.url()).toBe(`http://127.0.0.1:${port}/studio/`);

    // File ▸ Connect to... opens the launch page over the session, with the
    // runtime in use marked; closing it changes nothing.
    const again = await windowAfter(() => clickMenu("desktop:connect-to"));
    await again.waitForURL(LAUNCH_PAGE);
    await again.getByText("Connected", { exact: true }).waitFor();
    expect(
      await again
        .getByLabel("Runtimes")
        .getByRole("button", { name: "Connect" })
        .isDisabled(),
    ).toBe(true);
    await again.close();
    expect(page.isClosed()).toBe(false);
    expect(await studioTitle()).toBe(
      `Elsewhere - 127.0.0.1:${port} - Difracta`,
    );

    // A remembered runtime that is gone sends the next launch here, saying why.
    await app?.close();
    await stopStandalone();
    const fallback = await launchToPage();
    await fallback
      .getByRole("alert")
      .filter({ hasText: `No Runtime answered at 127.0.0.1:${port}` })
      .waitFor();
  });

  it("asks before a file from the OS takes it away from a runtime elsewhere", async () => {
    const port = await standaloneRuntime(await installationFile("Elsewhere"));
    const file = await installationFile("Here");
    const launchPage = await launchToPage();
    const address = launchPage.getByRole("textbox");
    await address.fill(`http://127.0.0.1:${port}/studio/`);
    const remote = await windowAfter(() => address.press("Enter"));
    await remote.waitForFunction(() => document.title.startsWith("Elsewhere"));

    // Cancel keeps the remote session; Switch and Open runs the file here.
    for (const answer of [1, 0]) {
      const asked = app?.evaluate(({ dialog }, response) => {
        return new Promise<string>((resolve) => {
          dialog.showMessageBox = (...args: unknown[]) => {
            const options = args[1] as { message: string; buttons: string[] };
            resolve(`${options.message} ${options.buttons.join("/")}`);
            return Promise.resolve({ response, checkboxChecked: false });
          };
        });
      }, answer);
      if (answer === 1) {
        await secondLaunch(file);
        expect(await asked).toBe(
          "Open “Here.difracta” on this computer? Switch and Open/Cancel",
        );
        expect(remote.isClosed()).toBe(false);
      } else {
        const local = await windowAfter(() => secondLaunch(file));
        await local.waitForFunction(() => document.title.startsWith("Here"));
        expect(local.url()).toBe(
          `http://127.0.0.1:${env.DIFRACTA_PORT}/studio/`,
        );
        expect(await local.evaluate(() => typeof window.difractaDesktop)).toBe(
          "object",
        );
      }
    }
  });

  it("says on the launch page why this computer's runtime cannot start", async () => {
    // Something else holds Desktop's port.
    const blocker = createServer();
    await new Promise<void>((resolve) =>
      blocker.listen(Number(env.DIFRACTA_PORT), "0.0.0.0", resolve),
    );
    const launchPage = await launchToPage();
    const run = launchPage.getByRole("button", {
      name: "Run on this computer",
    });
    await run.click();
    await launchPage
      .getByRole("alert")
      .filter({ hasText: "already in use" })
      .waitFor();

    await new Promise((resolve) => blocker.close(resolve));
    const page = await windowAfter(() => run.click());
    await page.waitForFunction(() => document.title.startsWith("Untitled"));
  });
});
