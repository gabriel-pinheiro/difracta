import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * The Desktop suite: the built app launched for real through Playwright's
 * Electron driver, kept out of the default `npm test` because Electron needs
 * a display. Build first (`npm run build`), then `npm run test:desktop`,
 * which on Linux runs under Xvfb when `xvfb-run` is installed
 * (`scripts/test-desktop.mjs`), so the windows stay off the screen and there
 * is the one Display the Display Host tests count on; the harness keeps
 * Electron off a Wayland session there. `DIFRACTA_DESKTOP_HEADED=1` runs it on
 * the real display, where those tests are skipped if it has several.
 */
export default defineConfig({
  test: {
    dir: fileURLToPath(new URL(".", import.meta.url)),
    include: ["**/*.test.ts"],
    // One Electron at a time: two would race each other for focus under Xvfb.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
