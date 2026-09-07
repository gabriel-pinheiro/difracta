import { defineConfig } from "vite";

const runtime = process.env.DIFRACTA_RUNTIME_URL ?? "http://127.0.0.1:4800";

export default defineConfig({
  base: "/output/",
  server: {
    hmr: { path: "/output/hmr" },
    proxy: {
      "/live": { target: runtime, ws: true },
      "/health": { target: runtime },
    },
  },
});
