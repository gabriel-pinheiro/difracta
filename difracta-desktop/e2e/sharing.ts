import { DifractaClient } from "@difracta/client";
import type { MediaLive } from "@difracta/protocol";
import type { Page } from "playwright";

import {
  app,
  clickMenu,
  commandFromElsewhere,
  eventually,
  windowAfter,
} from "./harness.ts";

/**
 * What the tests of Desktop as a Sharer (`share.test.ts`) stand on: an
 * Installation with a slot and a Layer showing it, the share window driven
 * as a person would, and what the runtime says of the slot.
 */
export const SHARE_PAGE = "app://desktop/studio/share.html";
// An Output page draws once it has WebGL, which under Xvfb is Chromium's software one.
export const SOFTWARE_WEBGL = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
];
export const SLOT = "m_laptop";
type Port = string | number | undefined;

/** What the runtime says of the slot, asked as another client that follows live state. */
export async function slotLive(port: Port): Promise<MediaLive> {
  const client = new DifractaClient({
    url: `ws://127.0.0.1:${String(port ?? "")}/live`,
    kind: "cli",
    reconnect: false,
  });
  try {
    const summary = await eventually(
      () => Promise.resolve(client.document.get()),
      (document) => document !== null,
    );
    const view = client.openDocument(summary?.id ?? "", { live: true });
    await eventually(
      () => Promise.resolve(view.get()),
      (document) => document !== undefined,
    );
    const live = view.liveState.get().media[SLOT];
    if (live === undefined) throw new Error("The runtime has no such slot.");
    return live;
  } finally {
    client.close();
  }
}

export const slotIs = (port: Port, status: MediaLive["status"]) =>
  eventually(
    () => slotLive(port),
    (live) => live.status === status,
  );

/** An Output with a Surface, the slot, and a Scene whose Live Layer shows the slot, stretched. */
export async function stage(port: Port): Promise<void> {
  const run = (name: string, payload: unknown) =>
    commandFromElsewhere(String(port), name, payload);
  await run("output.create", { id: "wall", name: "Wall" });
  await run("surface.create", {
    id: "front",
    name: "Front",
    outputs: ["wall"],
  });
  await run("media.create", { id: SLOT, kind: "share", name: "Laptop" });
  await run("scene.create", { id: "show", name: "Show" });
  await run("layer.create", {
    id: "share",
    kind: "visual",
    sceneId: "show",
    target: "front",
    name: "Share",
  });
  await run("layer.visual", { layerId: "share", visual: "live" });
  for (const [name, value] of [
    ["media", SLOT],
    ["fit", "stretch"],
  ])
    await run("address.edit", {
      address: `layer/share/param/${name ?? ""}`,
      value,
    });
  await run("address.trigger", { address: "scene/show/play" });
}

/** File ▸ Share Screen...: the share window's page. */
export async function openShareWindow(): Promise<Page> {
  const page = await windowAfter(() => clickMenu("desktop:share-screen"));
  await page.waitForURL(SHARE_PAGE);
  return page;
}

/**
 * Starts a share of the screen into the slot, through the share window's
 * own picker, which is what a session without a system picker has and what
 * Xvfb is. Screens are asked for apart from windows, so a list of windows
 * that fails there (no window manager) costs nothing.
 */
export async function shareTheScreen(page: Page, port: Port): Promise<void> {
  await page.getByTestId("share-slot").filter({ hasText: "Laptop" }).waitFor();
  await page.getByRole("button", { name: "Choose what to share…" }).click();
  await page.getByTestId("share-source-screen").first().click();
  await page.getByTestId("share-row").waitFor();
  await slotIs(port, "live");
}

/** Closes the share window as a person would, which hides it while it shares. */
export async function closeShareWindow(): Promise<void> {
  await app?.evaluate(({ BrowserWindow }, url) => {
    BrowserWindow.getAllWindows()
      .find((window) => window.webContents.getURL() === url)
      ?.close();
  }, SHARE_PAGE);
}

export async function shareWindows(): Promise<{ visible: boolean }[]> {
  const windows = await app?.evaluate(
    ({ BrowserWindow }, url) =>
      BrowserWindow.getAllWindows()
        .filter((window) => window.webContents.getURL() === url)
        .map((window) => ({ visible: window.isVisible() })),
    SHARE_PAGE,
  );
  return windows ?? [];
}

/** A window of plain green at the screen's top left, above the others: something to share that is known. */
export async function greenWindow(): Promise<{
  width: number;
  height: number;
}> {
  const size = await app?.evaluate(async ({ BrowserWindow, screen }) => {
    const window = new BrowserWindow({
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      frame: false,
      backgroundColor: "#00ff00",
    });
    await window.loadURL(
      "data:text/html,<body style='margin:0;background:%2300ff00'></body>",
    );
    window.moveTop();
    return screen.getPrimaryDisplay().size;
  });
  if (size === undefined) throw new Error("No application.");
  return size;
}

/** The colour at the middle of the Output page's canvas, read in the frame it was drawn in. */
export function middlePixel(output: Page): Promise<number[]> {
  return output.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        requestAnimationFrame(() => {
          const drawn = document.querySelector("canvas");
          const copy = document.createElement("canvas");
          copy.width = 8;
          copy.height = 8;
          const context = copy.getContext("2d");
          if (drawn === null || context === null) {
            resolve([]);
            return;
          }
          context.drawImage(drawn, 0, 0, 8, 8);
          resolve([...context.getImageData(4, 4, 1, 1).data]);
        });
      }),
  );
}
