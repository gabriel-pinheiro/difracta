import { settings } from "@difracta/core";
import { builtInCatalog } from "@difracta/visuals";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { RuntimeConfig } from "./config.ts";
import { buildRuntime, type Runtime } from "./server.ts";

let dir: string;
const runtimes: Runtime[] = [];
const route = settings.runtime.fontsPath;

async function runtimeWith(config: Partial<RuntimeConfig>): Promise<Runtime> {
  const runtime = await buildRuntime({
    host: "127.0.0.1",
    port: 0,
    documents: "free",
    openPath: undefined,
    studioDist: undefined,
    outputDist: undefined,
    thumbnailsDir: undefined,
    fontsDir: undefined,
    bundledDir: undefined,
    autosaveIntervalMs: 60_000,
    oscPort: undefined,
    discovery: false,
    mediaAnywhere: false,
    ...config,
  });
  runtimes.push(runtime);
  await runtime.app.ready();
  return runtime;
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "difracta-fonts-"));
});

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
  await rm(dir, { recursive: true, force: true });
});

describe("the Bundled Fonts' route", () => {
  it("serves every file the Catalog's fonts name, to any origin", async () => {
    const { app } = await runtimeWith({});
    const files = builtInCatalog.fonts().flatMap((font) => font.files);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const response = await app.inject({ url: `${route}/${file}` });
      expect(response.statusCode, file).toBe(200);
      expect(response.headers["access-control-allow-origin"]).toBe("*");
      expect(response.headers["content-type"]).toBe("font/woff2");
      // Every WOFF2 file starts with its signature.
      expect(response.rawPayload.subarray(0, 4).toString("latin1")).toBe(
        "wOF2",
      );
    }
  });

  it("answers 404 for a file that is not there, or outside the folder", async () => {
    const { app } = await runtimeWith({});
    for (const url of [
      `${route}/nope.woff2`,
      `${route}/`,
      `${route}/../package.json`,
      `${route}/%2e%2e/package.json`,
    ])
      expect((await app.inject({ url })).statusCode, url).toBe(404);
  });

  it("serves the folder the configuration names instead", async () => {
    const fonts = path.join(dir, "fonts");
    await mkdir(fonts);
    await writeFile(path.join(fonts, "mine.woff2"), "wOF2 mine");
    await writeFile(path.join(dir, "secret.txt"), "no");
    const { app } = await runtimeWith({ fontsDir: fonts });
    const response = await app.inject({ url: `${route}/mine.woff2` });
    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("*");
    expect(response.body).toBe("wOF2 mine");
    expect(
      (await app.inject({ url: `${route}/inter-latin.woff2` })).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ url: `${route}/../secret.txt` })).statusCode,
    ).toBe(404);
  });
});
