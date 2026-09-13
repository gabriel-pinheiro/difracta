import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * The GPU suite: real renders in headless Chromium, kept out of the
 * default `npm test`. Run with `npm run test:gpu`; it needs Chromium for
 * Playwright once (`npx playwright install chromium`). The tests are the
 * ones in this folder, wherever the config is run from.
 */
export default defineConfig({
  test: {
    dir: fileURLToPath(new URL(".", import.meta.url)),
    include: ["**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
