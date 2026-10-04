// Renders the Catalog's thumbnails through the compositor itself, one PNG
// per definition in `thumbnails/`. Run it after adding or changing a
// definition:
//
//   npm run thumbnails -w @difracta/visuals            every definition
//   npm run thumbnails -w @difracta/visuals koi-pond   some of them
//   … --seconds=5                                       run this long first
//
// Needs Chromium for Playwright (`npx playwright install chromium`).
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { mediaExtension, parsePackManifest } from "@difracta/core";
import { build } from "esbuild";
import { chromium } from "playwright";

import {
  builtInCatalog,
  bundledRoot,
  fontsRoot,
  thumbnailFile,
  thumbnailsRoot,
} from "../src/index.ts";
import type {
  FontFiles,
  ThumbnailKind,
  ThumbnailMedia,
} from "./thumbnail-page.ts";
import {
  THUMBNAIL_IMAGE,
  THUMBNAIL_IMAGE_ENTRY,
  THUMBNAIL_VIDEO,
  THUMBNAIL_VIDEO_ENTRY,
} from "./thumbnail-setups.ts";

const ORIGIN = "https://thumbnails.invalid/";
const WIDTH = 480;
const HEIGHT = 270;

const wanted = new Set<string>();
/** Null leaves each definition the length its setup asks for, or the page's own. */
let seconds: number | null = null;
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

/** The Bundled Pack's clip and picture shown and the Bundled Fonts, as data URLs the page can load without a server. */
async function dataUrl(file: URL, type: string): Promise<string> {
  const bytes = await readFile(file);
  return `data:${type};base64,${bytes.toString("base64")}`;
}
/** The Bundled Pack's manifest, `.difracta/pack.json` where `npm run media:fetch` put it. */
const manifest = parsePackManifest(
  JSON.parse(
    await readFile(new URL(".difracta/pack.json", bundledRoot), "utf8"),
  ),
);
if (!manifest.ok) {
  console.error(manifest.error);
  process.exit(1);
}
const bundledEntry = (id: string) => {
  const entry = manifest.manifest.entries.find((entry) => entry.id === id);
  if (entry === undefined) {
    console.error(`The Bundled Pack has no “${id}”; run npm run media:fetch.`);
    process.exit(1);
  }
  return entry;
};
const clip = bundledEntry(THUMBNAIL_VIDEO_ENTRY);
const picture = bundledEntry(THUMBNAIL_IMAGE_ENTRY);
const media: ThumbnailMedia = {
  // The Pack has clips only: the picture is the baked thumbnail of one.
  [THUMBNAIL_IMAGE]: await dataUrl(
    new URL(`.difracta/thumbs/${picture.fingerprint}.webp`, bundledRoot),
    "image/webp",
  ),
  [THUMBNAIL_VIDEO]: await dataUrl(
    new URL(clip.file, bundledRoot),
    `video/${mediaExtension(clip.file) ?? "webm"}`,
  ),
};
const fonts: FontFiles = Object.fromEntries(
  await Promise.all(
    builtInCatalog
      .fonts()
      .flatMap((font) => font.files)
      .map(
        async (file) =>
          [
            file,
            await dataUrl(new URL(file, fontsRoot), "font/woff2"),
          ] as const,
      ),
  ),
);

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
          options.media,
          options.fonts,
        ),
      { kind, id, seconds, width: WIDTH, height: HEIGHT, media, fonts },
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
