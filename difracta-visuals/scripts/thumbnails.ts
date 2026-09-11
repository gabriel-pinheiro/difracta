// Renders the Catalog's thumbnails through the compositor itself, one PNG
// per definition in `thumbnails/`. Run it after adding or changing a
// definition:
//
//   npm run thumbnails -w @difracta/visuals            every definition
//   npm run thumbnails -w @difracta/visuals koi-pond   some of them
//   … --seconds=5                                       run longer first
//
// Needs Chromium for Playwright (`npx playwright install chromium`).
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { chromium } from "playwright";

import { builtInCatalog, thumbnailFile, thumbnailsRoot } from "../src/index.ts";
import type { ThumbnailKind } from "./thumbnail-page.ts";

const ORIGIN = "https://thumbnails.invalid/";
const WIDTH = 480;
const HEIGHT = 270;
const DEFAULT_SECONDS = 3;

const wanted = new Set<string>();
let seconds = DEFAULT_SECONDS;
for (const argument of process.argv.slice(2)) {
  const match = /^--seconds=(\d+(?:\.\d+)?)$/.exec(argument);
  if (match?.[1] !== undefined) seconds = Number(match[1]);
  else if (argument.startsWith("--")) {
    console.error(`Unknown option ${argument}`);
    process.exit(1);
  } else wanted.add(argument);
}

const definitions: { kind: ThumbnailKind; id: string }[] = [
  ...builtInCatalog
    .visuals()
    .map((v) => ({ kind: "visual" as const, id: v.id })),
  ...builtInCatalog
    .filters()
    .map((f) => ({ kind: "filter" as const, id: f.id })),
].filter(({ id }) => wanted.size === 0 || wanted.has(id));
for (const id of wanted)
  if (!definitions.some((definition) => definition.id === id)) {
    console.error(`“${id}” is not in the Catalog.`);
    process.exit(1);
  }

const bundle = await build({
  entryPoints: [fileURLToPath(new URL("./thumbnail-page.ts", import.meta.url))],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: "es2022",
  // The Catalog module locates this folder from its own URL; the page has none.
  define: { "import.meta.url": JSON.stringify(ORIGIN) },
  logLevel: "silent",
});
const script = bundle.outputFiles[0]?.text;
if (script === undefined) throw new Error("The page did not bundle.");

const browser = await chromium.launch({
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  const page = await browser.newPage();
  page.on("pageerror", (error) => console.error(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(message.text());
  });
  // A secure origin, served from here: the document model wants `crypto`.
  await page.route(ORIGIN, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Thumbnails</title>",
    }),
  );
  await page.goto(ORIGIN);
  await page.addScriptTag({ content: script });
  await mkdir(thumbnailsRoot, { recursive: true });
  for (const { kind, id } of definitions) {
    const dataUrl = await page.evaluate(
      (options) =>
        window.renderThumbnail(
          options.kind,
          options.id,
          options.seconds,
          options.width,
          options.height,
        ),
      { kind, id, seconds, width: WIDTH, height: HEIGHT },
    );
    const base64 = dataUrl.split(",")[1];
    if (base64 === undefined) throw new Error(`No image for “${id}”.`);
    const file = new URL(thumbnailFile(id), thumbnailsRoot);
    await writeFile(file, Buffer.from(base64, "base64"));
    console.log(`${kind.padEnd(6)} ${id.padEnd(20)} → ${fileURLToPath(file)}`);
  }
} finally {
  await browser.close();
}
