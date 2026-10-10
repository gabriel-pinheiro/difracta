import { rename } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  app,
  dir,
  env,
  eventually,
  installationFile,
  launch,
  useDesktop,
  windowAfter,
} from "./harness.ts";
import {
  IMAGE_LAYER,
  middlePixelOnScreen,
  packFolder,
  stageImage,
} from "./pack-fixture.ts";
import { SOFTWARE_WEBGL } from "./sharing.ts";

useDesktop();

describe("Packs in Studio", () => {
  it("adds a Pack, shows its entry on an Output, and locates it after moving its folder while loaded", async () => {
    const port = env.DIFRACTA_PORT;
    const studio = await launch(
      await installationFile("Clips"),
      SOFTWARE_WEBGL,
    );
    await studio.waitForFunction(() => document.title.startsWith("Clips"));
    await stageImage(port);
    const folder = await packFolder(dir, "neon");

    // The Bundled Pack is there from the start, and cannot be removed.
    await studio.locator('[data-pack-row="bundled"]').waitFor();

    // Add Pack ▸ From folder…: the native folder picker, answered for it here.
    await app?.evaluate(({ dialog }, picked) => {
      dialog.showOpenDialog = () =>
        Promise.resolve({ canceled: false, filePaths: [picked] });
    }, folder);
    await studio.getByRole("button", { name: "Add to Media" }).first().click();
    await studio.getByRole("menuitem", { name: "Add Pack" }).click();
    await studio.getByRole("menuitem", { name: "From folder…" }).click();

    // The Pack's row appears, named after its folder, and the Library opens on it to browse.
    const row = studio.locator("[data-pack-row]").filter({ hasText: "neon" });
    await row.waitFor();
    const tile = studio
      .getByTestId("library-tile")
      .filter({ hasText: "green" });
    await tile.waitFor();
    await studio.getByTestId("pack-inspector").waitFor();

    // Browsing: a tile selects the entry, whose inspector takes the Pack's place.
    await tile.click();
    await studio.getByTestId("entry-inspector").waitFor();
    await studio
      .getByTestId("entry-inspector")
      .getByText("green", { exact: false })
      .first()
      .waitFor();

    // Pick the entry for the Layer: its chip opens the Library picking for the Image Parameter.
    await studio.locator(`[data-navigator-row="${IMAGE_LAYER}"]`).click();
    const chip = studio.locator(
      `[data-media-chip="layer/${IMAGE_LAYER}/param/media"]`,
    );
    await chip.waitFor();
    expect(await chip.getAttribute("data-chip-state")).toBe("empty");
    await chip.click();
    await studio.getByTestId("media-description").waitFor();
    await tile.click();
    await studio.keyboard.press("Enter");
    await eventually(
      () => chip.getAttribute("data-chip-state"),
      (state) => state === "entry",
    );
    await chip.filter({ hasText: "green" }).waitFor();
    expect(await studio.getByTestId("library").count()).toBe(0);

    // An Output page of this Desktop shows the picture, stretched over the Surface.
    await windowAfter(() =>
      studio.evaluate(() => {
        window.open("/output/?output=wall");
      }),
    );
    const [red, green, blue] = await eventually(
      () => middlePixelOnScreen("/output/"),
      ([r = 0, g = 0, b = 0]) => g > 180 && r < 90 && b < 90,
    );
    expect([red, green, blue]).toHaveLength(3);

    // A folder moved while loaded still reads as ready. Locate must be
    // available beside its Location without reopening the Installation.
    await row.click();
    const inspector = studio.getByTestId("pack-inspector");
    await inspector.getByText("Prepared", { exact: false }).waitFor();
    const reference = await tile.getAttribute("data-id");
    expect(reference).toBeTruthy();
    await studio.getByRole("button", { name: "Close the Library" }).click();
    await inspector.getByRole("button", { name: "Browse media" }).click();
    await tile.waitFor();
    const moved = path.join(dir, "moved-neon");
    await rename(folder, moved);
    await app?.evaluate(({ dialog }, picked) => {
      dialog.showOpenDialog = () =>
        Promise.resolve({ canceled: false, filePaths: [picked] });
    }, moved);
    await inspector.getByRole("button", { name: "Locate…" }).click();
    await inspector.getByText(moved, { exact: true }).waitFor();
    expect(await tile.getAttribute("data-id")).toBe(reference);
    // The same entry reference now serves the image from the new folder.
    const response = await fetch(
      `http://127.0.0.1:${port ?? ""}/packs/${reference ?? ""}`,
    );
    expect(response.ok).toBe(true);
  });
});
