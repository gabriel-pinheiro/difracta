import { BASE_PROXY_HEIGHT, settings } from "@difracta/core";
import Fastify, { type FastifyInstance } from "fastify";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { FAKE_TOOLS, fakeRunner, tempDir, writeTree } from "./fixtures.ts";
import { addPack, prepareProxy } from "./pack-operations.ts";
import { registerPackRoutes } from "./pack-routes.ts";
import { PackStore } from "./pack-store.ts";
import { PackRegistry } from "./registry.ts";
import { parseByteRange } from "./send-file.ts";

const route = settings.runtime.packsPath;
let done: (() => Promise<void>) | undefined;
let app: FastifyInstance | undefined;
let store: PackStore | undefined;
afterEach(async () => {
  await store?.idle();
  await app?.close();
  await done?.();
});

async function stage() {
  const temp = await tempDir();
  done = temp.done;
  const registry = new PackRegistry(path.join(temp.dir, "packs.json"));
  store = new PackStore({
    bundledDir: path.join(temp.dir, "no-bundle"),
    registry,
    cacheRoot: path.join(temp.dir, "cache"),
    tools: FAKE_TOOLS,
    runner: fakeRunner({ size: { width: 3840, height: 2160 } }),
    log: () => undefined,
    random: () => 0.5,
  });
  const neon = path.join(temp.dir, "Neon");
  await writeTree(neon, {
    "a.mp4": "abcdefghijklmnopqrstuvwxyz",
    "b.png": "image bytes",
  });
  app = Fastify();
  registerPackRoutes(app, store);
  await app.ready();
  return { store, neon, app };
}

describe("parseByteRange", () => {
  it("reads one range, a suffix, and refuses what falls outside", () => {
    expect(parseByteRange(undefined, 10)).toBeUndefined();
    expect(parseByteRange("bytes=0-3", 10)).toEqual({ start: 0, end: 3 });
    expect(parseByteRange("bytes=4-", 10)).toEqual({ start: 4, end: 9 });
    expect(parseByteRange("bytes=-3", 10)).toEqual({ start: 7, end: 9 });
    expect(parseByteRange("bytes=2-100", 10)).toEqual({ start: 2, end: 9 });
    expect(parseByteRange("bytes=10-", 10)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=0-1,3-4", 10)).toBeUndefined();
  });
});

describe("GET /packs/<packId>/<entryId>", () => {
  it("is 404, naming the problem, for an unknown Pack, an unknown entry and a missing file", async () => {
    const { store, neon, app } = await stage();
    const none = await app.inject({ url: `${route}/nope-aaaa/a` });
    expect(none.statusCode).toBe(404);
    expect(none.json()).toEqual({ error: "No Pack “nope-aaaa” is loaded." });
    const added = await addPack(store, neon);
    if (!added.ok) throw new Error(added.error);
    const id = added.result.packId;
    const unknown = await app.inject({ url: `${route}/${id}/zzz` });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json<{ error: string }>().error).toContain("no entry “zzz”");
    const { rm } = await import("node:fs/promises");
    await rm(path.join(neon, "b.png"));
    const gone = await app.inject({ url: `${route}/${id}/b` });
    expect(gone.statusCode).toBe(404);
    expect(gone.json<{ error: string }>().error).toContain("No file at");
  });

  it("streams the original with its type, ETag, no-cache and Range, and the baked files once they exist", async () => {
    const { store, neon, app } = await stage();
    const added = await addPack(store, neon);
    if (!added.ok) throw new Error(added.error);
    const id = added.result.packId;
    const whole = await app.inject({ url: `${route}/${id}/a` });
    expect(whole.statusCode).toBe(200);
    expect(whole.headers["content-type"]).toBe("video/mp4");
    expect(whole.headers["cache-control"]).toBe("no-cache");
    expect(whole.headers["access-control-allow-origin"]).toBe("*");
    expect(whole.headers["accept-ranges"]).toBe("bytes");
    expect(whole.body).toBe("abcdefghijklmnopqrstuvwxyz");
    const etag = whole.headers.etag!;
    expect(etag).toMatch(/^W\/"/);
    expect(
      (
        await app.inject({
          url: `${route}/${id}/a`,
          headers: { "if-none-match": etag },
        })
      ).statusCode,
    ).toBe(304);
    const part = await app.inject({
      url: `${route}/${id}/a`,
      headers: { range: "bytes=2-4" },
    });
    expect(part.statusCode).toBe(206);
    expect(part.headers["content-range"]).toBe("bytes 2-4/26");
    expect(part.body).toBe("cde");
    expect(
      (
        await app.inject({
          url: `${route}/${id}/a`,
          headers: { range: "bytes=30-" },
        })
      ).statusCode,
    ).toBe(416);
    expect(
      (await app.inject({ url: `${route}/${id}/b` })).headers["content-type"],
    ).toBe("image/png");

    // Thumbnail and proxy: 404 until baked, then served.
    const earlyThumb = await app.inject({ url: `${route}/${id}/a/thumb` });
    const earlyProxy = await app.inject({ url: `${route}/${id}/a/proxy` });
    expect([earlyThumb.statusCode, earlyProxy.statusCode]).toEqual([404, 404]);
    expect(earlyThumb.json<{ error: string }>().error).toContain(
      "no thumbnail yet",
    );
    await store.idle();
    const thumb = await app.inject({ url: `${route}/${id}/a/thumb` });
    expect(thumb.statusCode).toBe(200);
    expect(thumb.headers["content-type"]).toBe("image/webp");
    expect(thumb.body).toMatch(/^baked .*\.webp$/);
    const proxy = await app.inject({ url: `${route}/${id}/a/proxy` });
    expect(proxy.statusCode).toBe(200);
    expect(proxy.headers["content-type"]).toBe("video/mp4");
    const imageProxy = await app.inject({ url: `${route}/${id}/b/proxy` });
    expect(imageProxy.statusCode).toBe(404);
    expect(imageProxy.json<{ error: string }>().error).toContain("is an image");

    // A proxy of another height: 404 until asked for and baked, then served under its height.
    const base = await app.inject({
      url: `${route}/${id}/a/proxy/${String(BASE_PROXY_HEIGHT)}`,
    });
    expect(base.statusCode).toBe(200);
    expect(base.body).toBe(proxy.body);
    const early = await app.inject({ url: `${route}/${id}/a/proxy/1080` });
    expect(early.statusCode).toBe(404);
    expect(early.json<{ error: string }>().error).toContain(
      "no proxy 1080 pixels high",
    );
    await prepareProxy(store, id, "a", 1080);
    await store.idle();
    const sized = await app.inject({ url: `${route}/${id}/a/proxy/1080` });
    expect(sized.statusCode).toBe(200);
    expect(sized.headers["content-type"]).toBe("video/mp4");
    expect(sized.body).toMatch(/^baked .*\.1080\.mp4$/);
    const odd = await app.inject({ url: `${route}/${id}/a/proxy/tall` });
    expect(odd.statusCode).toBe(404);
    expect(odd.json<{ error: string }>().error).toContain(
      "is not a proxy height",
    );
  });
});
