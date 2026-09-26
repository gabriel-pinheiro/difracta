import { createBuiltInRegistry } from "@difracta/core";
import { builtInCatalog } from "@difracta/visuals";
import { mkdtemp, readFile, rm, stat, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  autosavePathFor,
  listAutosaves,
  parseDocumentFile,
  serializeDocument,
} from "./document-file.ts";
import { DocumentStore } from "./document-store.ts";

let dir: string;
let store: DocumentStore;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The autosaves of `filePath` once one of them says `text`. The sidecar is
 * written on a timer, which a busy machine runs late, so a test waits for
 * the write rather than a fixed time; one that never comes still fails.
 */
async function autosaveSaying(
  filePath: string,
  text: string,
): Promise<readonly string[]> {
  const deadline = Date.now() + 5_000;
  for (;;) {
    const sidecars = await listAutosaves(filePath);
    const texts = await Promise.all(
      sidecars.map((sidecar) => readFile(sidecar, "utf8")),
    );
    if (texts.some((t) => t.includes(text)) || Date.now() > deadline)
      return sidecars;
    await sleep(10);
  }
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "difracta-"));
  store = new DocumentStore({
    registry: createBuiltInRegistry(builtInCatalog),
    autosaveIntervalMs: 10,
  });
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("DocumentStore", () => {
  it("creates, saves as a .difracta file, and reopens it", async () => {
    const created = await store.create("Living", { blank: true });
    expect(created.ok).toBe(true);
    const documentId = created.ok ? created.result.id : "";
    store
      .session(documentId)!
      .execute("output.create", { id: "out_a", name: "TV" }, "test");

    const saved = await store.save(documentId, path.join(dir, "living"));
    expect(saved.ok && saved.result).toMatchObject({
      path: path.join(dir, "living.difracta"),
      dirty: false,
    });

    const text = await readFile(path.join(dir, "living.difracta"), "utf8");
    expect(text).toContain('"kind": "difracta-installation"');
    expect(text).not.toContain("operational");
    const parsed = parseDocumentFile(text);
    expect(parsed.ok && parsed.document.outputs.out_a?.name).toBe("TV");

    expect((await store.close(documentId)).ok).toBe(true);
    expect(store.current()).toBeNull();
    const reopened = await store.open(path.join(dir, "living"));
    expect(reopened.ok && reopened.result.outputs).toEqual([
      { id: "out_a", name: "TV" },
    ]);
  });

  it("holds one document: new and open replace it, refusing to drop unsaved changes", async () => {
    const created = await store.create("X");
    const documentId = created.ok ? created.result.id : "";
    store
      .session(documentId)!
      .execute("output.create", { id: "out_a", name: "TV" }, "test");
    expect((await store.close(documentId)).ok).toBe(false);
    expect((await store.create("Y")).ok).toBe(false);
    const replaced = await store.create("Y", { discard: true });
    expect(replaced.ok && replaced.result.name).toBe("Y");
    expect(store.session(documentId)).toBeUndefined();
    expect(store.current()?.name).toBe("Y");
    await store.save(
      replaced.ok ? replaced.result.id : "",
      path.join(dir, "y"),
    );
    const opened = await store.open(path.join(dir, "y"));
    expect(opened.ok && opened.result.id).toBe(store.current()?.id);
  });

  it("a new Installation is the starter with nothing to undo, or empty when blank", async () => {
    const created = await store.create("Living");
    expect(created.ok && created.result).toMatchObject({ dirty: false });
    const session = store.currentSession()!;
    const { outputs, surfaces, scenes, layers } = session.document;
    const names = (table: Readonly<Record<string, { name: string }>>) =>
      Object.values(table).map((entity) => entity.name);
    expect(names(outputs)).toEqual(["Output 1"]);
    expect(names(surfaces)).toEqual(["Full Frame"]);
    expect(names(scenes)).toEqual(["Scene 1"]);
    expect(names(layers)).toEqual(["Zoom Rush"]);
    expect(session.execute("history.undo", {}, "test").ok).toBe(false);

    const blank = await store.create("Empty", { blank: true });
    expect(blank.ok && blank.result.outputs).toEqual([]);
    expect(Object.keys(store.currentSession()!.document.layers)).toEqual([]);
  });

  it("a new Installation is clean until something changes it, and still needs a path to save", async () => {
    const created = await store.create("X");
    expect(created.ok && created.result).toMatchObject({
      dirty: false,
      path: null,
    });
    const documentId = created.ok ? created.result.id : "";
    expect(await store.save(documentId)).toEqual({
      ok: false,
      error: "This Installation has no file yet; supply a path.",
    });
    // Nothing to lose, so new and open replace it without a discard.
    const replaced = await store.create("Y");
    expect(replaced.ok).toBe(true);
    store
      .currentSession()!
      .execute("output.create", { id: "out_a", name: "TV" }, "test");
    expect(store.current()?.dirty).toBe(true);
    expect((await store.create("Z")).ok).toBe(false);
  });

  it("names files by absolute path only", async () => {
    const created = await store.create("X");
    const documentId = created.ok ? created.result.id : "";
    const refused = await store.save(documentId, "living");
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.error).toContain("not an absolute path");
    expect((await store.open("living")).ok).toBe(false);
  });

  it("openOrCreate writes a missing file, named after it, folders included", async () => {
    const filePath = path.join(dir, "shows", "tour", "living.difracta");
    const opened = await store.openOrCreate(filePath);
    expect(opened.ok && opened.result).toMatchObject({
      name: "living",
      path: filePath,
      dirty: false,
      recovered: false,
    });
    const parsed = parseDocumentFile(await readFile(filePath, "utf8"));
    expect(parsed.ok && parsed.document.installation.name).toBe("living");
    expect(parsed.ok && Object.keys(parsed.document.layers)).toHaveLength(1);

    // An existing file is opened as it is.
    store
      .currentSession()!
      .execute("installation.rename", { name: "Living Room" }, "test");
    await store.save(opened.ok ? opened.result.id : "");
    store = new DocumentStore({
      registry: createBuiltInRegistry(builtInCatalog),
    });
    const reopened = await store.openOrCreate(filePath);
    expect(reopened.ok && reopened.result.name).toBe("Living Room");
  });

  it("discarding a dirty document also drops its autosaves", async () => {
    const created = await store.create("Living");
    const documentId = created.ok ? created.result.id : "";
    await store.save(documentId, path.join(dir, "living"));
    store
      .session(documentId)!
      .execute("installation.rename", { name: "Changed" }, "test");
    const filePath = path.join(dir, "living.difracta");
    expect(await autosaveSaying(filePath, "Changed")).toHaveLength(1);
    await store.create("Other", { discard: true });
    expect(await listAutosaves(filePath)).toEqual([]);
  });

  it("autosaves dirty documents, recovers on open, and reverts to the file", async () => {
    const created = await store.create("Living", { blank: true });
    const documentId = created.ok ? created.result.id : "";
    await store.save(documentId, path.join(dir, "living"));
    const filePath = path.join(dir, "living.difracta");
    store
      .session(documentId)!
      .execute("installation.rename", { name: "Living 2" }, "test");
    const sidecars = await autosaveSaying(filePath, "Living 2");
    expect(sidecars).toHaveLength(1);
    expect(sidecars[0]).toMatch(/\/living\.\d{8}T\d{6}Z\.autosave\.difracta$/);
    expect(await readFile(sidecars[0]!, "utf8")).toContain("Living 2");

    // Make the sidecar unambiguously newer than the file.
    const later = new Date(Date.now() + 5_000);
    await utimes(sidecars[0]!, later, later);

    // A runtime that died leaves the sidecar behind; the next one recovers it.
    store = new DocumentStore({
      registry: createBuiltInRegistry(builtInCatalog),
      autosaveIntervalMs: 10,
    });
    const recovered = await store.open(path.join(dir, "living"));
    expect(recovered.ok && recovered.result).toMatchObject({
      name: "Living 2",
      dirty: true,
      recovered: true,
    });

    const deltas: unknown[] = [];
    store.session(documentId)!.onDelta((delta) => deltas.push(delta.patches));
    const reverted = await store.revert(documentId);
    expect(reverted.ok && reverted.result).toMatchObject({
      name: "Living",
      dirty: false,
      recovered: false,
    });
    // One set per table, so a replica catches up whatever the file holds.
    expect(deltas).toHaveLength(1);
    const patches = deltas[0] as { path: string[]; value: unknown }[];
    expect(patches.map((patch) => patch.path)).toEqual(
      Object.keys(store.session(documentId)!.document)
        .filter((table) => table !== "operational")
        .map((table) => [table]),
    );
    expect(patches[0]?.value).toEqual({
      id: documentId,
      name: "Living",
      activeScene: null,
    });
    expect(await listAutosaves(filePath)).toEqual([]);
    expect(
      store.session(documentId)!.execute("history.undo", {}, "test").ok,
    ).toBe(false);

    store
      .session(documentId)!
      .execute("installation.rename", { name: "Living 3" }, "test");
    await autosaveSaying(filePath, "Living 3");
    await store.save(documentId);
    expect(await listAutosaves(filePath)).toEqual([]);
    expect(await readFile(filePath, "utf8")).toContain("Living 3");
  });

  it("keeps the sidecar at most one delay behind the last of several changes", async () => {
    const created = await store.create("Living");
    const documentId = created.ok ? created.result.id : "";
    await store.save(documentId, path.join(dir, "living"));
    const filePath = path.join(dir, "living.difracta");
    const session = store.session(documentId)!;
    for (const name of ["Living 1", "Living 2", "Living 3"])
      session.execute("installation.rename", { name }, "test");
    let sidecars = await autosaveSaying(filePath, "Living 3");
    expect(sidecars).toHaveLength(1);
    expect(await readFile(sidecars[0]!, "utf8")).toContain("Living 3");

    // Changes after the first sidecar reach the next one as well.
    session.execute("installation.rename", { name: "Living 4" }, "test");
    sidecars = await autosaveSaying(filePath, "Living 4");
    expect(sidecars).toHaveLength(1);
    expect(await readFile(sidecars[0]!, "utf8")).toContain("Living 4");
  });

  it("flush writes what changed since the last sidecar, and nothing otherwise", async () => {
    const created = await store.create("Living");
    const documentId = created.ok ? created.result.id : "";
    await store.save(documentId, path.join(dir, "living"));
    const filePath = path.join(dir, "living.difracta");
    const session = store.session(documentId)!;
    session.execute("installation.rename", { name: "Living 2" }, "test");
    expect(await autosaveSaying(filePath, "Living 2")).toHaveLength(1);

    session.execute("installation.rename", { name: "Living 3" }, "test");
    await store.flush();
    const sidecars = await listAutosaves(filePath);
    expect(sidecars).toHaveLength(1);
    expect(await readFile(sidecars[0]!, "utf8")).toContain("Living 3");

    const past = new Date(Date.now() - 60_000);
    await utimes(sidecars[0]!, past, past);
    await store.flush();
    expect((await stat(sidecars[0]!)).mtimeMs).toBeLessThan(
      past.getTime() + 1_000,
    );
  });

  it("writes by the max wait while changes keep coming", async () => {
    store = new DocumentStore({
      registry: createBuiltInRegistry(builtInCatalog),
      autosaveIntervalMs: 60,
      autosaveMaxWaitMs: 120,
    });
    const created = await store.create("Living");
    const documentId = created.ok ? created.result.id : "";
    await store.save(documentId, path.join(dir, "living"));
    const filePath = path.join(dir, "living.difracta");
    const session = store.session(documentId)!;
    for (let step = 1; step <= 20; step += 1) {
      session.execute(
        "installation.rename",
        { name: `Living ${step}` },
        "test",
      );
      await sleep(15);
      // 180ms in: changes come faster than the delay, only the max wait writes.
      if (step === 12) expect(await listAutosaves(filePath)).toHaveLength(1);
    }
    const sidecars = await autosaveSaying(filePath, "Living 20");
    expect(sidecars).toHaveLength(1);
    expect(await readFile(sidecars[0]!, "utf8")).toContain("Living 20");
  });

  it("names autosaves after the file with a filesystem-safe ISO timestamp", () => {
    expect(
      autosavePathFor(
        "/shows/living.difracta",
        new Date("2026-09-06T22:39:33.500Z"),
      ),
    ).toBe("/shows/living.20260906T223933Z.autosave.difracta");
  });

  it("rejects files that are not Installations", () => {
    expect(parseDocumentFile("{}").ok).toBe(false);
    expect(parseDocumentFile("nope").ok).toBe(false);
    const round = parseDocumentFile(
      serializeDocument({
        installation: { id: "i" as never, name: "N", activeScene: null },
        outputs: {},
        surfaces: {},
        regions: {},
        masks: {},
        paths: {},
        media: {},
        scenes: {},
        layers: {},
        controllers: {},
        links: {},
        macros: {},
        operational: { blackout: true, calibration: null, sequence: {} },
      }),
    );
    expect(round.ok && round.document.operational.blackout).toBe(false);
  });
});
