import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  app,
  clickMenu,
  env,
  eventually,
  installationFile,
  launch,
  quit,
  standaloneRuntime,
  userData,
  useDesktop,
  windowAfter,
} from "./harness.ts";

useDesktop();

/** The zoom level of the Studio window, and of every other window, asked of main. */
async function zoomLevels(): Promise<{
  studio?: number | undefined;
  others: number[];
}> {
  const levels = await app?.evaluate(({ BrowserWindow }) => {
    const all = BrowserWindow.getAllWindows().map((window) => ({
      url: window.webContents.getURL(),
      level: window.webContents.getZoomLevel(),
    }));
    const isStudio = (url: string): boolean =>
      url.startsWith("http") && url.includes("/studio/");
    return {
      studio: all.find(({ url }) => isStudio(url))?.level,
      others: all.filter(({ url }) => !isStudio(url)).map(({ level }) => level),
    };
  });
  return levels ?? { others: [] };
}

async function actualSize(): Promise<[string, boolean] | undefined> {
  return app?.evaluate(({ Menu }) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById("view:actual-size");
    return item === null || item === undefined
      ? undefined
      : ([item.label, item.enabled] as [string, boolean]);
  });
}

describe("Studio's zoom in Difracta Desktop", () => {
  it("is one setting for every Studio window, local or elsewhere, never an Output's, and kept for the next launch", async () => {
    const file = await installationFile("Zoomed");
    let page = await launch(file);
    await page.waitForFunction(() => document.title.startsWith("Zoomed"));
    expect(await actualSize()).toEqual(["Actual Size", false]);

    await clickMenu("view:zoom-in");
    await clickMenu("view:zoom-in");
    await eventually(zoomLevels, ({ studio }) => studio === 1);
    await eventually(
      actualSize,
      (item) => item?.[0] === "Actual Size (Now 120%)" && item[1],
    );

    // Chromium remembers a zoom per host and shares it between the host's
    // pages: a page of the runtime zoomed the ordinary way leaves one behind.
    await app?.evaluate(async ({ BrowserWindow }, port) => {
      const plain = new BrowserWindow({ show: false });
      await plain.loadURL(`http://127.0.0.1:${port}/output/`);
      plain.webContents.setZoomLevel(5);
    }, env.DIFRACTA_PORT);
    await eventually(zoomLevels, ({ others }) => others.includes(5));

    // An Output page opened from Studio stays at 100% all the same, and so
    // does Studio, whose zoom is its own.
    const [output] = await Promise.all([
      app?.waitForEvent("window"),
      page.evaluate(() => {
        window.open(`${location.origin}/output/?output=none`);
      }),
    ]);
    await output?.waitForURL(/\/output\/\?output=none$/);
    // Studio is at 120%, so the screen's own ratio is its ratio over 1.2.
    expect(await output?.evaluate(() => devicePixelRatio)).toBeCloseTo(
      await page.evaluate(() => devicePixelRatio / 1.2),
      4,
    );
    const levels = await zoomLevels();
    expect(levels.studio).toBe(1);
    expect([...levels.others].sort()).toEqual([0, 5]);

    // A reload keeps it.
    await clickMenu("help:reload-studio");
    await page.waitForFunction(() => document.title.startsWith("Zoomed"));
    expect((await zoomLevels()).studio).toBe(1);

    await eventually(
      () => readFile(path.join(userData, "desktop-state.json"), "utf8"),
      (text) => (JSON.parse(text) as { zoomLevel?: number }).zoomLevel === 1,
    );
    await quit();

    page = await launch(file);
    await page.waitForFunction(() => document.title.startsWith("Zoomed"));
    await eventually(zoomLevels, ({ studio }) => studio === 1);
    await eventually(
      actualSize,
      (item) => item?.[0] === "Actual Size (Now 120%)",
    );

    // A runtime elsewhere shows at the same zoom.
    const port = await standaloneRuntime(await installationFile("Elsewhere"));
    const chooser = await windowAfter(() => clickMenu("desktop:connect-to"));
    const address = chooser.getByRole("textbox");
    await address.fill(`127.0.0.1:${String(port)}`);
    page = await windowAfter(() => address.press("Enter"));
    await page.waitForFunction(() => document.title.startsWith("Elsewhere"));
    await eventually(zoomLevels, ({ studio }) => studio === 1);

    await clickMenu("view:actual-size");
    await eventually(zoomLevels, ({ studio }) => studio === 0);
    await eventually(actualSize, (item) => item?.[1] === false);
  });
});
