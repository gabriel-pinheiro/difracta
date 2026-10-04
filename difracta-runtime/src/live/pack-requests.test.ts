import { DifractaClient, type DocumentView } from "@difracta/client";
import type { PackLive } from "@difracta/protocol";
import { bundledRoot } from "@difracta/visuals";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildRuntime, type Runtime } from "../server.ts";

let dir: string;
let runtime: Runtime;
let url: string;
const clients: DifractaClient[] = [];

function waitFor<TValue>(
  read: () => TValue | undefined,
  timeoutMs = 5_000,
): Promise<TValue> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = (): void => {
      const value = read();
      if (value !== undefined) resolve(value);
      else if (Date.now() - started > timeoutMs)
        reject(new Error("Timed out."));
      else setTimeout(tick, 10);
    };
    tick();
  });
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "difracta-pack-requests-"));
  runtime = await buildRuntime({
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
    packs: [],
    packsFile: path.join(dir, "config", "packs.json"),
    packsCacheDir: path.join(dir, "cache"),
  });
  const address = await runtime.listen();
  url = `${address.replace("http", "ws")}/live`;
});

afterEach(async () => {
  for (const client of clients) client.close();
  clients.length = 0;
  await runtime.packs.idle();
  await runtime.close();
  await rm(dir, { recursive: true, force: true });
});

async function connect(kind: "studio" | "output" | "cli") {
  const client = new DifractaClient({ url, kind, reconnect: false });
  clients.push(client);
  await waitFor(() => (client.phase.get() === "connected" ? true : undefined));
  return client;
}

const packsOf = (view: DocumentView): Record<string, PackLive> | undefined =>
  view.valueAt<Record<string, PackLive>>(["live", "packs"]);

describe("Pack requests over the live protocol", () => {
  it("snapshots the Bundled Pack as prepared, to every subscriber asking for the packs section", async () => {
    const studio = await connect("studio");
    const created = await studio.request<{ id: string }>("documents.new", {
      name: "Show",
      blank: true,
    });
    const all = studio.openDocument(created.id, { live: true });
    const output = await connect("output");
    const some = output.openDocument(created.id, { live: ["packs"] });
    const bundled = await waitFor(() => packsOf(all)?.bundled);
    expect(bundled).toMatchObject({
      name: "Bundled",
      readOnly: true,
      status: "ok",
      folder: fileURLToPath(bundledRoot),
    });
    expect(bundled.prepared.done).toBe(bundled.prepared.total);
    expect(Object.keys(bundled.entries).length).toBe(bundled.prepared.total);
    const scoped = await waitFor(() => packsOf(some)?.bundled);
    expect(scoped).toEqual(bundled);
    // The Output page asked for packs alone: the other sections stay empty.
    expect(some.valueAt(["live", "outputs"])).toEqual({});
    expect(some.valueAt(["live", "osc"])).toEqual({ port: null, listeners: 0 });
  });

  it("adds a folder as a Pack: attached with a hint, in the Registry, in the live state, and bakes it", async () => {
    const studio = await connect("studio");
    const show = path.join(dir, "show", "live.difracta");
    await mkdir(path.dirname(show), { recursive: true });
    const created = await studio.request<{ id: string }>("documents.new", {
      name: "Show",
      blank: true,
    });
    await studio.request("documents.save", {
      documentId: created.id,
      path: show,
    });
    const view = studio.openDocument(created.id, { live: true });
    const neon = path.join(dir, "show", "Neon");
    await mkdir(path.join(neon, "loops"), { recursive: true });
    await writeFile(path.join(neon, "loops", "a.mp4"), "aaaa");
    await writeFile(path.join(neon, "b.png"), "bbbb");

    const added = await studio.request<{ packId: string; name: string }>(
      "packs.add",
      { folder: neon },
    );
    expect(added.name).toBe("Neon");
    expect(added.packId).toMatch(/^neon-[a-z0-9]{4}$/);
    const document = await waitFor(() =>
      view.get()?.packs[added.packId] === undefined ? undefined : view.get(),
    );
    expect(document.packs[added.packId]).toEqual({
      id: added.packId,
      name: "Neon",
      relativePath: "Neon",
    });
    const live = await waitFor(() => packsOf(view)?.[added.packId]);
    expect(live).toMatchObject({ name: "Neon", status: "ok", folder: neon });
    expect(Object.keys(live.entries).sort()).toEqual(["b", "loops-a"]);
    expect(
      JSON.parse(
        await readFile(path.join(dir, "config", "packs.json"), "utf8"),
      ),
    ).toMatchObject({
      packs: { [added.packId]: { folder: neon, name: "Neon" } },
    });
    expect(await studio.request("packs.known", {})).toEqual([
      { id: added.packId, name: "Neon", folder: neon, loaded: true },
    ]);
    // The same folder again is already attached.
    await expect(studio.request("packs.add", { folder: neon })).rejects.toThrow(
      /already attached/,
    );

    // A tag edit is one patch on the entry; a rename reaches the manifest and the Installation's copy.
    const tagsSeen: unknown[] = [];
    view.subscribePath(
      ["live", "packs", added.packId, "entries", "loops-a", "tags"],
      () =>
        tagsSeen.push(
          view.valueAt([
            "live",
            "packs",
            added.packId,
            "entries",
            "loops-a",
            "tags",
          ]),
        ),
    );
    await studio.request("media.update", {
      packId: added.packId,
      entryId: "loops-a",
      tags: ["Loop", "riser"],
    });
    await waitFor(() => (tagsSeen.length > 0 ? true : undefined));
    expect(tagsSeen.at(-1)).toEqual(["Loop", "riser"]);
    await studio.request("packs.rename", {
      packId: added.packId,
      name: "Neon VJ",
    });
    await waitFor(() =>
      view.get()?.packs[added.packId]?.name === "Neon VJ" ? true : undefined,
    );
    expect(packsOf(view)?.[added.packId]?.name).toBe("Neon VJ");
    const manifest = JSON.parse(
      await readFile(path.join(neon, ".difracta", "pack.json"), "utf8"),
    ) as { name: string; entries: { id: string; tags: string[] }[] };
    expect(manifest.name).toBe("Neon VJ");
    expect(
      manifest.entries.find((entry) => entry.id === "loops-a")?.tags,
    ).toEqual(["Loop", "riser"]);

    // The Bundled Pack refuses every write; an unknown Pack is named.
    await expect(
      studio.request("media.update", {
        packId: "bundled",
        entryId: "beam-scan-loop",
        tags: ["x"],
      }),
    ).rejects.toThrow(/read-only/);
    await expect(
      studio.request("packs.rename", { packId: "bundled", name: "Mine" }),
    ).rejects.toThrow(/read-only/);
    await expect(
      studio.request("packs.rescan", { packId: "none-aaaa" }),
    ).rejects.toThrow(/No Pack “none-aaaa”/);

    // Detaching unloads it; the Registry still knows it, so attaching again loads it.
    await studio.command(created.id, "packs.detach", { packId: added.packId });
    await waitFor(() =>
      packsOf(view)?.[added.packId] === undefined ? true : undefined,
    );
    expect(
      (await studio.request<{ loaded: boolean }[]>("packs.known", {}))[0]
        ?.loaded,
    ).toBe(false);
    await studio.command(created.id, "packs.attach", {
      packId: added.packId,
      name: "Neon VJ",
    });
    const back = await waitFor(() => {
      const pack = packsOf(view)?.[added.packId];
      return pack?.status === "ok" ? pack : undefined;
    });
    expect(back.folder).toBe(neon);
    expect(back.name).toBe("Neon VJ");
  });

  it("marks an attached Pack this machine lacks as missing until it is located", async () => {
    const studio = await connect("studio");
    const created = await studio.request<{ id: string }>("documents.new", {
      name: "Show",
      blank: true,
    });
    const view = studio.openDocument(created.id, { live: true });
    await studio.command(created.id, "packs.attach", {
      packId: "friend-k7f3",
      name: "Friend's Pack",
    });
    const missing = await waitFor(() => {
      const pack = packsOf(view)?.["friend-k7f3"];
      return pack?.status === "missing" ? pack : undefined;
    });
    expect(missing).toMatchObject({
      name: "Friend's Pack",
      folder: "",
      entries: {},
    });
    const folder = path.join(dir, "friend");
    await mkdir(path.join(folder, ".difracta"), { recursive: true });
    await writeFile(path.join(folder, "x.png"), "x");
    await writeFile(
      path.join(folder, ".difracta", "pack.json"),
      JSON.stringify({
        version: 1,
        id: "friend-k7f3",
        name: "Friend",
        entries: [],
      }),
    );
    const other = path.join(dir, "other");
    await mkdir(other, { recursive: true });
    await expect(
      studio.request("packs.locate", { packId: "friend-k7f3", folder: other }),
    ).rejects.toThrow(/no Pack manifest/);
    expect(
      await studio.request("packs.locate", { packId: "friend-k7f3", folder }),
    ).toEqual({ packId: "friend-k7f3", name: "Friend" });
    const located = await waitFor(() => {
      const pack = packsOf(view)?.["friend-k7f3"];
      return pack?.status === "ok" ? pack : undefined;
    });
    expect(located.folder).toBe(folder);
    expect(Object.keys(located.entries)).toEqual(["x"]);
    const original = await fetch(
      `${url.replace("ws", "http").replace("/live", "")}/packs/friend-k7f3/x`,
    );
    expect(original.status).toBe(200);
    expect(await original.text()).toBe("x");
  });
});
