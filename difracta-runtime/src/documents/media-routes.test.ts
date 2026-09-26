import {
  Catalog,
  createBuiltInRegistry,
  settings,
  type MediaDefinition,
} from "@difracta/core";
import Fastify, { type FastifyInstance } from "fastify";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DocumentStore } from "./document-store.ts";
import { mediaContentType } from "./media-files.ts";
import { parseByteRange, registerMediaRoutes } from "./media-routes.ts";

const route = settings.runtime.mediaPath;
const bundledRoute = settings.runtime.bundledPath;
const entry = (id: string, file: string): MediaDefinition => ({
  kind: "media",
  id,
  name: id,
  description: id,
  type: file.endsWith(".png") ? "image" : "video",
  file,
  width: 16,
  height: 9,
});
/** Flash Cut's clip is in the bundle's folder; Grid's is not. */
const catalog = new Catalog({
  media: [
    entry("flash-cut", "clips/flash-cut.webm"),
    entry("grid", "clips/grid.png"),
  ],
});
let dir: string;
let store: DocumentStore;
let app: FastifyInstance;
let anywhere: FastifyInstance;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "difracta-media-"));
  await mkdir(path.join(dir, "bundled", "clips"), { recursive: true });
  await writeFile(
    path.join(dir, "bundled", "clips", "flash-cut.webm"),
    "flash bytes",
  );
  store = new DocumentStore({ registry: createBuiltInRegistry(catalog) });
  const serving = { catalog, bundledDir: path.join(dir, "bundled") };
  app = Fastify();
  registerMediaRoutes(app, store, {
    ...serving,
    allowOutsideShowFolder: false,
  });
  anywhere = Fastify();
  registerMediaRoutes(anywhere, store, {
    ...serving,
    allowOutsideShowFolder: true,
  });
  await Promise.all([app.ready(), anywhere.ready()]);
});

afterEach(async () => {
  await Promise.all([app.close(), anywhere.close()]);
  await rm(dir, { recursive: true, force: true });
});

/** A saved Installation in `dir/show` with a 26-byte "image" in its art folder and a video one folder up. */
async function stage(): Promise<{ id: string }> {
  const created = await store.create("Show", { blank: true });
  if (!created.ok) throw new Error(created.error);
  const session = store.session(created.result.id)!;
  await mkdir(path.join(dir, "show", "art"), { recursive: true });
  await writeFile(
    path.join(dir, "show", "art", "logo.png"),
    "abcdefghijklmnopqrstuvwxyz",
  );
  await writeFile(path.join(dir, "loop.mp4"), "video bytes");
  await store.save(session.id, path.join(dir, "show", "show.difracta"));
  session.execute("media.create", { id: "m_logo", path: "art/logo.png" }, "t");
  session.execute("media.create", { id: "m_loop", path: "../loop.mp4" }, "t");
  session.execute("media.create", { id: "m_gone", path: "art/gone.webp" }, "t");
  return { id: session.id };
}

describe("GET /media/<id>", () => {
  it("is 404 with nothing open, for an unknown id, a missing file or an unsaved Installation", async () => {
    expect((await app.inject({ url: `${route}/m_logo` })).statusCode).toBe(404);
    await stage();
    const unknown = await app.inject({ url: `${route}/nope` });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toEqual({ error: "No Media item “nope”." });
    store
      .currentSession()!
      .execute(
        "media.create",
        { id: "g_art", kind: "group", name: "Art" },
        "t",
      );
    const group = await app.inject({ url: `${route}/g_art` });
    expect(group.statusCode).toBe(404);
    expect(group.json()).toEqual({
      error: "“Art” is a Media Group, which has no file.",
    });
    const gone = await app.inject({ url: `${route}/m_gone` });
    expect(gone.statusCode).toBe(404);
    expect(gone.json<{ error: string }>().error).toContain("no file at");

    await store.create("Fresh", { discard: true, blank: true });
    store
      .currentSession()!
      .execute("media.create", { id: "m_x", path: "x.png" }, "t");
    const unsaved = await app.inject({ url: `${route}/m_x` });
    expect(unsaved.statusCode).toBe(404);
    expect(unsaved.json<{ error: string }>().error).toContain("Save it first");
  });

  it("streams the file with its content type, an ETag and no-cache, revalidating by ETag", async () => {
    await stage();
    const response = await app.inject({ url: `${route}/m_logo` });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("image/png");
    expect(response.headers["cache-control"]).toBe("no-cache");
    expect(response.headers["accept-ranges"]).toBe("bytes");
    expect(response.headers["access-control-allow-origin"]).toBe("*");
    expect(response.headers["content-length"]).toBe("26");
    expect(response.body).toBe("abcdefghijklmnopqrstuvwxyz");
    const etag = response.headers.etag!;
    expect(etag).toMatch(/^W\/"[0-9a-f]+-[0-9a-f]+"$/);
    const cached = await app.inject({
      url: `${route}/m_logo`,
      headers: { "if-none-match": etag },
    });
    expect(cached.statusCode).toBe(304);
    expect(cached.body).toBe("");
  });

  it("honours a byte range, and answers 416 to one past the end", async () => {
    await stage();
    const middle = await app.inject({
      url: `${route}/m_logo`,
      headers: { range: "bytes=2-5" },
    });
    expect(middle.statusCode).toBe(206);
    expect(middle.headers["content-range"]).toBe("bytes 2-5/26");
    expect(middle.headers["content-length"]).toBe("4");
    expect(middle.body).toBe("cdef");
    const tail = await app.inject({
      url: `${route}/m_logo`,
      headers: { range: "bytes=20-" },
    });
    expect(tail.statusCode).toBe(206);
    expect(tail.headers["content-range"]).toBe("bytes 20-25/26");
    expect(tail.body).toBe("uvwxyz");
    const suffix = await app.inject({
      url: `${route}/m_logo`,
      headers: { range: "bytes=-3" },
    });
    expect(suffix.body).toBe("xyz");
    const beyond = await app.inject({
      url: `${route}/m_logo`,
      headers: { range: "bytes=26-" },
    });
    expect(beyond.statusCode).toBe(416);
    expect(beyond.headers["content-range"]).toBe("bytes */26");
    // A range for another version of the file is the whole file.
    const stale = await app.inject({
      url: `${route}/m_logo`,
      headers: { range: "bytes=2-5", "if-range": 'W/"0-0"' },
    });
    expect(stale.statusCode).toBe(200);
    expect(stale.body).toBe("abcdefghijklmnopqrstuvwxyz");
  });

  it("refuses a file outside the Installation's folder unless allowed", async () => {
    await stage();
    const refused = await app.inject({ url: `${route}/m_loop` });
    expect(refused.statusCode).toBe(403);
    expect(refused.json<{ error: string }>().error).toContain(
      "--media-anywhere",
    );
    const served = await anywhere.inject({ url: `${route}/m_loop` });
    expect(served.statusCode).toBe(200);
    expect(served.headers["content-type"]).toBe("video/mp4");
    expect(served.body).toBe("video bytes");
  });

  it("streams a bundled item's clip from the bundle, saved or not, and 404s one the Catalog lacks", async () => {
    await store.create("Fresh", { blank: true });
    const session = store.currentSession()!;
    session.execute(
      "media.create",
      { id: "m_flash", kind: "bundled", bundled: "flash-cut" },
      "t",
    );
    const served = await app.inject({
      url: `${route}/m_flash`,
      headers: { range: "bytes=0-4" },
    });
    expect(served.statusCode).toBe(206);
    expect(served.headers["content-type"]).toBe("video/webm");
    expect(served.headers["access-control-allow-origin"]).toBe("*");
    expect(served.body).toBe("flash");
    // A runtime whose bundle lacks the entry the item names.
    const lacking = Fastify();
    registerMediaRoutes(lacking, store, {
      catalog: new Catalog(),
      bundledDir: path.join(dir, "bundled"),
      allowOutsideShowFolder: false,
    });
    const unavailable = await lacking.inject({ url: `${route}/m_flash` });
    await lacking.close();
    expect(unavailable.statusCode).toBe(404);
    expect(unavailable.json()).toEqual({
      error:
        "Media “flash-cut” shows Bundled Media “flash-cut”, which this runtime lacks.",
    });
  });

  it("streams a Bundled Media entry by id, and 404s an unknown one or a missing file", async () => {
    const served = await app.inject({ url: `${bundledRoute}/flash-cut` });
    expect(served.statusCode).toBe(200);
    expect(served.headers["content-type"]).toBe("video/webm");
    expect(served.headers["content-length"]).toBe("11");
    expect(served.headers.etag).toMatch(/^W\//);
    expect(served.body).toBe("flash bytes");
    const unknown = await app.inject({ url: `${bundledRoute}/nope` });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toEqual({
      error: "No Bundled Media entry “nope”.",
    });
    const missing = await app.inject({ url: `${bundledRoute}/grid` });
    expect(missing.statusCode).toBe(404);
    expect(missing.json<{ error: string }>().error).toContain("media:fetch");
  });

  it("parses the ranges it honours", () => {
    expect(parseByteRange(undefined, 10)).toBeUndefined();
    expect(parseByteRange("bytes=0-9", 10)).toEqual({ start: 0, end: 9 });
    expect(parseByteRange("bytes=0-99", 10)).toEqual({ start: 0, end: 9 });
    expect(parseByteRange("bytes=-4", 10)).toEqual({ start: 6, end: 9 });
    expect(parseByteRange("bytes=-40", 10)).toEqual({ start: 0, end: 9 });
    expect(parseByteRange("bytes=10-", 10)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=5-4", 10)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=-0", 10)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=0-1,3-4", 10)).toBeUndefined();
    expect(parseByteRange("items=0-1", 10)).toBeUndefined();
    expect(parseByteRange("bytes=-", 10)).toBeUndefined();
    expect(mediaContentType("a/b.MOV")).toBe("video/quicktime");
    expect(mediaContentType("a/b.svg")).toBe("image/svg+xml");
    expect(mediaContentType("a/b")).toBe("application/octet-stream");
  });
});
