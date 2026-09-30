import { hostname } from "node:os";
import { describe, expect, it } from "vitest";

import { installationFile, launch, useDesktop } from "./harness.ts";
import { openShareWindow } from "./sharing.ts";

useDesktop();

describe("Studio and Screen Shares", () => {
  it("adds a slot, follows who shares into it, and stops the share", async () => {
    const studio = await launch(await installationFile("Slots"));
    await studio.waitForFunction(() => document.title.startsWith("Slots"));

    // The Media section's "+": the slot is added, selected, and idle.
    await studio.getByRole("button", { name: "Add to Media" }).first().click();
    await studio.getByRole("menuitem", { name: "Screen Share" }).click();
    await studio.locator('[data-share-status="idle"]').waitFor();
    await studio
      .getByTestId("share-status")
      .getByText("File ▸ Share Screen...", { exact: false })
      .waitFor();

    // Shared from this Desktop's share window.
    const page = await openShareWindow();
    await page
      .getByTestId("share-slot")
      .filter({ hasText: "Screen Share" })
      .waitFor();
    await page.getByRole("button", { name: "Choose what to share…" }).click();
    await page.getByTestId("share-source-screen").first().click();
    await page.getByTestId("share-row").waitFor();

    // Studio: the row says live, the status strip names slot and Sharer.
    await studio.locator('[data-share-status="live"]').waitFor();
    const reminder = studio.locator("[data-active-share]");
    await reminder.getByText(`Screen Share · ${hostname()}`).waitFor();
    await studio
      .getByTestId("share-status")
      .getByText(`${hostname()} shares a screen into it.`)
      .waitFor();

    // Stop from the slot's inspector ends it everywhere.
    await studio.getByRole("button", { name: "Stop" }).click();
    await studio.locator('[data-share-status="idle"]').waitFor();
    await page.getByTestId("share-start").waitFor();
    expect(await reminder.count()).toBe(0);
  });
});
