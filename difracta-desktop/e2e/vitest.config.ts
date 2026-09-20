import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * The Desktop suite: the built app launched for real through Playwright's
 * Electron driver, kept out of the default `npm test` because Electron needs
 * a display. Build first (`npm run build`), then `npm run test:desktop`; on
 * Linux without a screen, `xvfb-run -a npm run test:desktop`.
 */
export default defineConfig({
  test: {
    dir: fileURLToPath(new URL(".", import.meta.url)),
    include: ["**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
