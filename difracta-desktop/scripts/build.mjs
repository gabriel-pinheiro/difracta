// Builds everything Desktop runs from into dist/, so the app never needs tsx
// or the rest of the repository at run time:
//
//   dist/main.js       the main process (ESM)
//   dist/preload.cjs   Studio's preload script; a sandboxed preload must be one CommonJS file
//   dist/launch-preload.cjs   the launch page's preload script
//   dist/runtime.mjs   difracta-runtime and all it depends on, in one file, forked by main
//   dist/studio, dist/output, dist/thumbnails   what that runtime serves
//
// Studio and the Output page are built by their own packages first
// (`npm run build` at the root does them in order; `npm run desktop` too).
import { build } from "esbuild";
import { access, cp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = fileURLToPath(new URL("..", import.meta.url));
const repository = path.join(packageDir, "..");
const dist = path.join(packageDir, "dist");

const shared = {
  bundle: true,
  platform: "node",
  // Electron's bundled Node; `process.versions.node` inside the app says which.
  target: "node24",
  sourcemap: true,
  logLevel: "warning",
};

// An ES module has no `require`, and the CommonJS dependencies bundled into
// one (fastify in the runtime, bonjour-service in both) still call it for
// Node's built-ins. This banner gives the bundle one.
const requireBanner = {
  js: 'import { createRequire as difractaCreateRequire } from "node:module";\nconst require = difractaCreateRequire(import.meta.url);',
};

await rm(dist, { recursive: true, force: true });

await build({
  ...shared,
  entryPoints: [path.join(packageDir, "src/main.ts")],
  outfile: path.join(dist, "main.js"),
  format: "esm",
  banner: requireBanner,
  // Provided by Electron itself at run time, in main and preload alike.
  external: ["electron"],
});

for (const preload of ["preload", "launch-preload"])
  await build({
    ...shared,
    entryPoints: [path.join(packageDir, `src/${preload}.ts`)],
    outfile: path.join(dist, `${preload}.cjs`),
    format: "cjs",
    external: ["electron"],
  });

await build({
  ...shared,
  entryPoints: [path.join(repository, "difracta-runtime/src/main.ts")],
  outfile: path.join(dist, "runtime.mjs"),
  // ESM, because the runtime's main.ts uses top-level await.
  format: "esm",
  banner: requireBanner,
});

const served = [
  ["difracta-studio/dist", "studio", "npm run build -w @difracta/studio"],
  ["difracta-output/dist", "output", "npm run build -w @difracta/output"],
  ["difracta-visuals/thumbnails", "thumbnails", undefined],
];
for (const [from, to, howToBuild] of served) {
  const source = path.join(repository, from);
  try {
    await access(source);
  } catch {
    console.error(`${from} is missing. Build it first: ${howToBuild}`);
    process.exit(1);
  }
  await cp(source, path.join(dist, to), { recursive: true });
}
