import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
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
  renameFromElsewhere,
  sparePort,
  standaloneRuntime,
  studioTitle,
  windowAfter,
  useDesktop,
} from "./harness.ts";

useDesktop();

describe("Difracta Desktop's native menu", () => {
  it("shows Studio's menu in the native bar, where Save saves", async () => {
    const file = await installationFile("Before");
    const page = await launch(file);
    await page.waitForFunction(() => document.title.startsWith("Before"));

    // The in-page bar is gone; what it held is in the native menu and the title.
    await eventually(
      () => menuItems("file"),
      (items) => items.length > 3,
    );
    expect(await page.getByRole("menubar").count()).toBe(0);
    expect(await page.getByText("No Installation open").count()).toBe(0);
    expect(await menuItems("file")).toEqual([
      ["page:create", true],
      ["page:open", true],
      ["-", true],
      ["page:save", true],
      ["page:saveAs", true],
      ["page:revert", false],
      ["-", true],
      ["page:downloadCopy", true],
      ["page:replaceFromFile", true],
      ["-", true],
      ["page:close", true],
      ["-", true],
      ["desktop:connect-to", true],
      ["desktop:startup", true],
      ["-", true],
      ["desktop:quit", true],
    ]);
    expect(await menuItems("edit")).toEqual([
      ["page:undo", true],
      ["page:redo", true],
      // Nothing is selected yet, so there is nothing to remove.
      ["-", true],
      ["page:remove", false],
      ["-", true],
      ["cut", true],
      ["copy", true],
      ["paste", true],
      ["selectall", true],
    ]);
    expect((await menuItems("help")).map(([id]) => id)).toEqual([
      "help:reload-studio",
      "help:developer-tools",
      "help:runtime-log",
    ]);
    // Blackout, the bar's other control, is still in reach.
    await page.getByRole("button", { name: "Blackout" }).waitFor();

    // An unsaved change: the title says so, and Revert can.
    await renameFromElsewhere(env.DIFRACTA_PORT, "After");
    const where = file.replace(homedir(), "~");
    await eventually(
      studioTitle,
      (title) => title === `* After - ${where} - Difracta`,
    );
    await eventually(
      () => menuItems("file"),
      (items) => items.some(([id, enabled]) => id === "page:revert" && enabled),
    );

    await clickMenu("page:save");
    await eventually(
      () => readFile(file, "utf8"),
      (text) => text.includes('"After"'),
    );
    await eventually(
      studioTitle,
      (title) => title === `After - ${where} - Difracta`,
    );
    await eventually(
      () => menuItems("file"),
      (items) =>
        items.some(([id, enabled]) => id === "page:revert" && !enabled),
    );

    // A reload forgets the page's items until the new page describes them.
    await clickMenu("help:reload-studio");
    await eventually(
      () => menuItems("file"),
      (items) => items.some(([id]) => id === "page:save"),
    );
  });

  it("opens the launch page over a running session, and leaves it only for a target that answers and a person who agrees", async () => {
    const port = await standaloneRuntime(await installationFile("Elsewhere"));
    const launchPage = await launchToPage();
    const page = await windowAfter(() =>
      launchPage.getByRole("button", { name: "Run on this computer" }).click(),
    );
    await page.waitForFunction(() => document.title.startsWith("Untitled"));
    const health = (): Promise<boolean> =>
      fetch(`http://127.0.0.1:${env.DIFRACTA_PORT}/health`).then(
        (response) => response.ok,
        () => false,
      );

    // File ▸ Connect to...: the runtime goes on, and is what is marked in use.
    let chooser = await windowAfter(() => clickMenu("desktop:connect-to"));
    await chooser.waitForURL(LAUNCH_PAGE);
    const running = chooser.getByRole("button", {
      name: "Running on this computer",
    });
    await running.waitFor();
    expect(await running.isDisabled()).toBe(true);
    expect(await health()).toBe(true);
    // The launch window has the small menu, Studio keeps its own.
    expect((await menuItems("file")).map(([id]) => id)).toContain("page:save");

    // Closing it leaves everything as it was.
    await chooser.close();
    expect(page.isClosed()).toBe(false);
    expect(await health()).toBe(true);

    // An address nobody answers at is refused before anything is left.
    chooser = await windowAfter(() => clickMenu("desktop:connect-to"));
    const address = chooser.getByRole("textbox");
    await address.fill(`127.0.0.1:${await sparePort()}`);
    await address.press("Enter");
    await chooser
      .getByRole("alert")
      .filter({ hasText: "No Runtime answered" })
      .waitFor();
    expect(page.isClosed()).toBe(false);
    expect(await health()).toBe(true);

    // With unsaved changes leaving asks first, and Cancel stays: the launch
    // page closes and the session is as it was.
    await renameFromElsewhere(env.DIFRACTA_PORT, "Changed");
    await page.waitForFunction(() => document.title.startsWith("Changed*"));
    const answer = (response: number): Promise<string> | undefined =>
      app?.evaluate(({ dialog }, chosen) => {
        return new Promise<string>((resolve) => {
          dialog.showMessageBox = (...args: unknown[]) => {
            resolve((args[1] as { message: string }).message);
            return Promise.resolve({
              response: chosen,
              checkboxChecked: false,
            });
          };
        });
      }, response);
    const asked = answer(2);
    await address.fill(`127.0.0.1:${port}`);
    // Enter closes the page it is pressed in, which can happen before the
    // press itself settles; what follows checks the outcome.
    await address.press("Enter").catch(() => undefined);
    expect(await asked).toBe("Save the changes to “Changed”?");
    await eventually(
      () => Promise.resolve(chooser.isClosed()),
      (closed) => closed,
    );
    expect(page.isClosed()).toBe(false);
    expect(await health()).toBe(true);

    // Don't Save leaves: the runtime that answers takes over, and this
    // computer's stops.
    chooser = await windowAfter(() => clickMenu("desktop:connect-to"));
    void answer(1);
    const again = chooser.getByRole("textbox");
    await again.fill(`127.0.0.1:${port}`);
    const remote = await windowAfter(() =>
      again.press("Enter").catch(() => undefined),
    );
    await remote.waitForFunction(() => document.title.startsWith("Elsewhere"));
    await eventually(
      () => Promise.resolve(page.isClosed() && chooser.isClosed()),
      (closed) => closed,
    );
    await eventually(health, (up) => !up);
    await eventually(
      studioTitle,
      (title) => title === `Elsewhere - 127.0.0.1:${port} - Difracta`,
    );
  });
});
