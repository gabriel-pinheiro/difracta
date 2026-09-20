import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * The Desktop suite: the built app launched for real through Playwright's
 * Electron driver, kept out of the default `npm test` because Electron needs
 * a display. Build first (`npm run build`), then `npm run test:desktop`; on
 * Linux without a screen, or to keep the windows off yours,
 * `xvfb-run -a npm run test:desktop` (the harness keeps Electron off a Wayland
 * session there; `env -u WAYLAND_DISPLAY XDG_SESSION_TYPE=x11 xvfb-run -a npm
 * run test:desktop` says the same by hand).
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
