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

    // A page of the same runtime in a window of its own, as an Output opens:
    // Chromium's zoom per host must not reach it.
    await app?.evaluate(async ({ BrowserWindow }, port) => {
      await new BrowserWindow({ show: false }).loadURL(
        `http://127.0.0.1:${port}/output/`,
      );
    }, env.DIFRACTA_PORT);
    expect(await zoomLevels()).toEqual({ studio: 1, others: [0] });

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
