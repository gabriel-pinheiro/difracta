import { DifractaClient } from "@difracta/client";
import {
  Catalog,
  emptyDocument,
  emptyCatalog,
  id as brand,
  type Patch,
} from "@difracta/core";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildRuntime, type Runtime } from "../server.ts";
import { MediaStatuses } from "./media-status.ts";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "difracta-media-live-"));
  await mkdir(path.join(dir, "show", "art"), { recursive: true });
  await writeFile(path.join(dir, "show", "art", "logo.png"), "png");
  await writeFile(path.join(dir, "loop.mp4"), "mp4");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** Media files by id and path; a null path makes a Media Group. */
function withMedia(
  items: Record<string, string | null>,
  filePath: string | null,
) {
  const document = emptyDocument("Show");
  const base = (id: string) => ({
    id: brand("media", id),
    name: id,
    parentId: null,
    order: "a0",
  });
  return {
    document: {
      ...document,
      media: Object.fromEntries(
        Object.entries(items).map(([id, itemPath]) => [
          id,
          itemPath === null
            ? { ...base(id), kind: "group" as const }
            : { ...base(id), kind: "file" as const, path: itemPath },
        ]),
      ),
    },
    path: filePath,
  };
}

describe("MediaStatuses", () => {
  it("stats every file, skips Groups and replicates only what changed", async () => {
    const statuses = new MediaStatuses({
      allowOutsideShowFolder: false,
      catalog: emptyCatalog,
      bundledDir: dir,
    });
    const patches: Patch[] = [];
    statuses.onChange((emitted) => patches.push(...emitted));
    const file = path.join(dir, "show", "show.difracta");
    const items = {
      m_logo: "art/logo.png",
      g_art: null,
      m_loop: "../loop.mp4",
      m_gone: "art/gone.png",
    };
    await statuses.refresh(withMedia(items, null));
    expect(statuses.state()).toEqual({
      media: {
        m_logo: { status: "unsaved" },
        m_loop: { status: "unsaved" },
        m_gone: { status: "unsaved" },
      },
    });
    expect(patches).toHaveLength(3);

    patches.length = 0;
    await statuses.refresh(withMedia(items, file));
    expect(statuses.state()).toEqual({
      media: {
        m_logo: { status: "ok" },
        m_loop: { status: "outside" },
        m_gone: { status: "missing" },
      },
    });
    expect(patches).toEqual([
      { op: "set", path: ["media", "m_logo"], value: { status: "ok" } },
      { op: "set", path: ["media", "m_loop"], value: { status: "outside" } },
      { op: "set", path: ["media", "m_gone"], value: { status: "missing" } },
    ]);

    patches.length = 0;
    await statuses.refresh(withMedia(items, file));
    expect(patches).toEqual([]);
    await statuses.refresh(withMedia({ m_logo: "art/logo.png" }, file));
    expect(patches).toEqual([
      { op: "remove", path: ["media", "m_loop"] },
      { op: "remove", path: ["media", "m_gone"] },
    ]);

    patches.length = 0;
    await statuses.refresh(undefined);
    expect(patches).toEqual([{ op: "remove", path: ["media", "m_logo"] }]);
    expect(statuses.state()).toEqual({ media: {} });
  });

  it("serves outside items as ok or missing when allowed, and settles on the newest refresh", async () => {
    const statuses = new MediaStatuses({
      allowOutsideShowFolder: true,
      catalog: emptyCatalog,
      bundledDir: dir,
    });
    const file = path.join(dir, "show", "show.difracta");
    const first = statuses.refresh(
      withMedia({ m_loop: "../loop.mp4", m_far: "../far.mp4" }, file),
    );
    const second = statuses.refresh(withMedia({ m_loop: "../loop.mp4" }, file));
    await Promise.all([first, second]);
    expect(statuses.state()).toEqual({ media: { m_loop: { status: "ok" } } });
    await statuses.refresh(
      withMedia({ m_loop: "../loop.mp4", m_far: "../far.mp4" }, file),
    );
    expect(statuses.state().media.m_far).toEqual({ status: "missing" });
  });
});

describe("MediaStatuses for bundled items", () => {
  it("are ok when the Catalog has the entry, saved or not, and unavailable when it lacks it", async () => {
    await mkdir(path.join(dir, "bundled", "clips"), { recursive: true });
    await writeFile(path.join(dir, "bundled", "clips", "flash.webm"), "webm");
    const catalog = new Catalog({
      media: [
        {
          kind: "media",
          id: "flash",
          name: "Flash",
          description: "A flash.",
          type: "video",
          file: "clips/flash.webm",
          width: 16,
          height: 9,
        },
      ],
    });
    const statuses = new MediaStatuses({
      allowOutsideShowFolder: false,
      catalog,
      bundledDir: path.join(dir, "bundled"),
    });
    const bundled = (entry: string) => ({
      id: brand("media", `m_${entry}`),
      name: entry,
      parentId: null,
      order: "a0",
      kind: "bundled" as const,
      bundled: entry,
    });
    const source = {
      document: {
        ...emptyDocument("Show"),
        media: { m_flash: bundled("flash"), m_retired: bundled("retired") },
      },
      path: null,
    };
    await statuses.refresh(source);
    expect(statuses.state()).toEqual({
      media: {
        m_flash: { status: "ok" },
        m_retired: { status: "unavailable" },
      },
    });
  });
});

describe("Media status in the live state", () => {
  let runtime: Runtime;
  let url: string;

  beforeEach(async () => {
    runtime = await buildRuntime({
      host: "127.0.0.1",
      port: 0,
      documents: "free",
      openPath: undefined,
      studioDist: undefined,
      outputDist: undefined,
      thumbnailsDir: undefined,
      bundledDir: undefined,
      autosaveIntervalMs: 60_000,
      oscPort: undefined,
      discovery: false,
      mediaAnywhere: false,
    });
    const address = await runtime.listen();
    url = `${address.replace("http", "ws")}/live`;
  });

  afterEach(async () => {
    await runtime.close();
  });

  function waitFor(done: () => boolean, timeoutMs = 2_000): Promise<void> {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const tick = (): void => {
        if (done()) resolve();
        else if (Date.now() - started > timeoutMs)
          reject(new Error("Timed out."));
        else setTimeout(tick, 10);
      };
      tick();
    });
  }

  it("follows the document, its commands and its save path", async () => {
    const client = new DifractaClient({
      url,
      kind: "studio",
      reconnect: false,
      scheduleFlush: (flush) => setTimeout(flush, 0),
    });
    await waitFor(() => client.phase.get() === "connected");
    const created = await client.request<{ id: string }>("documents.new", {
      name: "Show",
      blank: true,
    });
    const view = client.openDocument(created.id, { live: true });
    await waitFor(() => view.get() !== undefined);
    const media = (): Record<string, { status: string }> =>
      view.liveState.get().media;

    // An unsaved Installation resolves nothing.
    await client.command(created.id, "media.create", {
      id: "m_logo",
      path: "art/logo.png",
    });
    await waitFor(() => media().m_logo?.status === "unsaved");

    // Saving next to the file finds it.
    await client.request("documents.save", {
      documentId: created.id,
      path: path.join(dir, "show", "show.difracta"),
    });
    await waitFor(() => media().m_logo?.status === "ok");

    // A path change is a command that touches media.
    await client.command(created.id, "media.path", {
      mediaId: "m_logo",
      path: "art/other.png",
    });
    await waitFor(() => media().m_logo?.status === "missing");
    await client.command(created.id, "media.create", {
      id: "m_loop",
      path: "../loop.mp4",
    });
    await waitFor(() => media().m_loop?.status === "outside");

    // Removing the item drops its entry; a later subscriber gets the same state in the snapshot.
    await client.command(created.id, "media.remove", { mediaId: "m_logo" });
    await waitFor(() => media().m_logo === undefined);
    await runtime.live.mediaSettled();
    const late = new DifractaClient({ url, kind: "cli", reconnect: false });
    await waitFor(() => late.phase.get() === "connected");
    const lateView = late.openDocument(created.id, { live: true });
    await waitFor(() => lateView.get() !== undefined);
    expect(lateView.liveState.get().media).toEqual({
      m_loop: { status: "outside" },
    });
    late.close();
    client.close();
  });
});
