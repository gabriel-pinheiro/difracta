import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["difracta-*/src/**/*.test.ts", "difracta-*/src/**/*.test.tsx"],
  },
});
