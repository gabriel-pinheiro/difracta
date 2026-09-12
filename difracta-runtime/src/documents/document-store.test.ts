import { createBuiltInRegistry } from "@difracta/core";
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

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "difracta-"));
  store = new DocumentStore({
    projectsDir: dir,
    registry: createBuiltInRegistry(),
    autosaveIntervalMs: 10,
  });
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("DocumentStore", () => {
  it("creates, saves as a .difracta file, and reopens it", async () => {
    const created = await store.create("Living");
    expect(created.ok).toBe(true);
    const documentId = created.ok ? created.result.id : "";
    store
      .session(documentId)!
      .execute("output.create", { id: "out_a", name: "TV" }, "test");

    const saved = await store.save(documentId, "living");
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
    const reopened = await store.open("living");
    expect(reopened.ok && reopened.result.outputs).toEqual([
      { id: "out_a", name: "TV" },
    ]);
    expect((await store.listFiles()).map((entry) => entry.name)).toEqual([
      "living",
    ]);
  });

  it("holds one document: new and open replace it, refusing to drop unsaved changes", async () => {
    const created = await store.create("X");
    const documentId = created.ok ? created.result.id : "";
    expect((await store.close(documentId)).ok).toBe(false);
    expect((await store.create("Y")).ok).toBe(false);
    const replaced = await store.create("Y", true);
    expect(replaced.ok && replaced.result.name).toBe("Y");
    expect(store.session(documentId)).toBeUndefined();
    expect(store.current()?.name).toBe("Y");
    await store.save(replaced.ok ? replaced.result.id : "", "y");
    const opened = await store.open("y");
    expect(opened.ok && opened.result.id).toBe(store.current()?.id);
  });

  it("discarding a dirty document also drops its autosaves", async () => {
    const created = await store.create("Living");
    const documentId = created.ok ? created.result.id : "";
    await store.save(documentId, "living");
    store
      .session(documentId)!
      .execute("installation.rename", { name: "Changed" }, "test");
    await new Promise((resolve) => setTimeout(resolve, 60));
    const filePath = path.join(dir, "living.difracta");
    expect(await listAutosaves(filePath)).toHaveLength(1);
    await store.create("Other", true);
    expect(await listAutosaves(filePath)).toEqual([]);
  });

  it("autosaves dirty documents, recovers on open, and reverts to the file", async () => {
    const created = await store.create("Living");
    const documentId = created.ok ? created.result.id : "";
    await store.save(documentId, "living");
    const filePath = path.join(dir, "living.difracta");
    store
      .session(documentId)!
      .execute("installation.rename", { name: "Living 2" }, "test");
    await new Promise((resolve) => setTimeout(resolve, 60));
    const sidecars = await listAutosaves(filePath);
    expect(sidecars).toHaveLength(1);
    expect(sidecars[0]).toMatch(/\/living\.\d{8}T\d{6}Z\.autosave\.difracta$/);
    expect(await readFile(sidecars[0]!, "utf8")).toContain("Living 2");

    // Make the sidecar unambiguously newer than the file.
    const later = new Date(Date.now() + 5_000);
    await utimes(sidecars[0]!, later, later);
    const listed = await store.listFiles();
    expect(listed.map((entry) => entry.name)).toEqual(["living"]);
    expect(listed[0]?.recoveryAvailable).toBe(true);

    // A runtime that died leaves the sidecar behind; the next one recovers it.
    store = new DocumentStore({
      projectsDir: dir,
      registry: createBuiltInRegistry(),
      autosaveIntervalMs: 10,
    });
    const recovered = await store.open("living");
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
    await new Promise((resolve) => setTimeout(resolve, 60));
    await store.save(documentId);
    expect(await listAutosaves(filePath)).toEqual([]);
    expect(await readFile(filePath, "utf8")).toContain("Living 3");
  });

  it("keeps the sidecar at most one delay behind the last of several changes", async () => {
    const created = await store.create("Living");
    const documentId = created.ok ? created.result.id : "";
    await store.save(documentId, "living");
    const filePath = path.join(dir, "living.difracta");
    const session = store.session(documentId)!;
    for (const name of ["Living 1", "Living 2", "Living 3"])
      session.execute("installation.rename", { name }, "test");
    await sleep(60);
    let sidecars = await listAutosaves(filePath);
    expect(sidecars).toHaveLength(1);
    expect(await readFile(sidecars[0]!, "utf8")).toContain("Living 3");

    // Changes after the first sidecar reach the next one as well.
    session.execute("installation.rename", { name: "Living 4" }, "test");
    await sleep(60);
    sidecars = await listAutosaves(filePath);
    expect(sidecars).toHaveLength(1);
    expect(await readFile(sidecars[0]!, "utf8")).toContain("Living 4");
  });

  it("flush writes what changed since the last sidecar, and nothing otherwise", async () => {
    const created = await store.create("Living");
    const documentId = created.ok ? created.result.id : "";
    await store.save(documentId, "living");
    const filePath = path.join(dir, "living.difracta");
    const session = store.session(documentId)!;
    session.execute("installation.rename", { name: "Living 2" }, "test");
    await sleep(60);
    expect(await listAutosaves(filePath)).toHaveLength(1);

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
      projectsDir: dir,
      registry: createBuiltInRegistry(),
      autosaveIntervalMs: 60,
      autosaveMaxWaitMs: 120,
    });
    const created = await store.create("Living");
    const documentId = created.ok ? created.result.id : "";
    await store.save(documentId, "living");
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
    await sleep(100);
    const sidecars = await listAutosaves(filePath);
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
        masks: {},
        paths: {},
        scenes: {},
        layers: {},
        controllers: {},
        links: {},
        macros: {},
        operational: { blackout: true, calibration: null },
      }),
    );
    expect(round.ok && round.document.operational.blackout).toBe(false);
  });
});
