import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

const runtime = process.env.DIFRACTA_RUNTIME_URL ?? "http://127.0.0.1:4800";
/** The Output dev server, proxied under /output/ so "Open page" links work in dev. */
const output = process.env.DIFRACTA_OUTPUT_DEV_URL ?? "http://127.0.0.1:4801";

export default defineConfig({
  base: "/studio/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  build: {
    // Two pages: Studio, and Difracta Desktop's launch page, which shares
    // Studio's components and none of its application code.
    rollupOptions: {
      input: {
        index: path.resolve(import.meta.dirname, "index.html"),
        launch: path.resolve(import.meta.dirname, "launch.html"),
      },
    },
  },
  server: {
    proxy: {
      "/live": { target: runtime, ws: true },
      "/health": { target: runtime },
      "/document": { target: runtime },
      "/catalog": { target: runtime },
      "/output": { target: output, ws: true },
    },
  },
});
