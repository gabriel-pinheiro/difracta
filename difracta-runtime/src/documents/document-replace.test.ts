import { createBuiltInRegistry, emptyDocument } from "@difracta/core";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { listAutosaves, serializeDocument } from "./document-file.ts";
import type { DocumentDelta } from "./document-session.ts";
import { DocumentStore } from "./document-store.ts";

let dir: string;
let store: DocumentStore;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "difracta-"));
  store = new DocumentStore({
    registry: createBuiltInRegistry(),
    autosaveIntervalMs: 10,
  });
});

afterEach(async () => {
  // A replaced document is dirty: let its pending sidecar land before the folder goes.
  await store.flush();
  await rm(dir, { recursive: true, force: true });
});

/** A saved show with one Output, and the text of a copy of it with another. */
async function savedShow(): Promise<{
  readonly documentId: string;
  readonly file: string;
  readonly copy: string;
}> {
  const file = path.join(dir, "show.difracta");
  const created = await store.create("Show");
  const documentId = created.ok ? created.result.id : "";
  const session = store.session(documentId)!;
  session.execute("output.create", { id: "out_a", name: "TV" }, "test");
  await store.save(documentId, file);
  session.execute("output.create", { id: "out_b", name: "Wall" }, "test");
  const copy = serializeDocument(session.document);
  await store.revert(documentId);
  return { documentId, file, copy };
}

describe("DocumentStore.replaceContent", () => {
  it("replaces the same Installation in place, in one delta, dirty, path kept, history dropped", async () => {
    const { documentId, file, copy } = await savedShow();
    const session = store.session(documentId)!;
    session.execute("installation.rename", { name: "Renamed" }, "test");
    await store.save(documentId);
    const deltas: DocumentDelta[] = [];
    session.onDelta((delta) => deltas.push(delta));
    const saved = await readFile(file, "utf8");

    const replaced = await store.replaceContent(copy);
    expect(replaced.ok && replaced.result).toMatchObject({
      id: documentId,
      name: "Show",
      path: file,
      dirty: true,
      recovered: false,
    });
    expect(store.currentSession()).toBe(session);
    expect(deltas).toHaveLength(1);
    expect(Object.keys(session.document.outputs)).toEqual(["out_a", "out_b"]);
    expect(session.execute("history.undo", {}, "test").ok).toBe(false);
    expect(await readFile(file, "utf8")).toBe(saved);
  });

  it("revert brings the saved show back after a replace", async () => {
    const { documentId, copy } = await savedShow();
    await store.replaceContent(copy);
    const reverted = await store.revert(documentId);
    expect(reverted.ok && reverted.result).toMatchObject({
      dirty: false,
      outputs: [{ id: "out_a", name: "TV" }],
    });
  });

  it("refuses over unsaved changes unless told to discard, and drops their autosave", async () => {
    const { documentId, file, copy } = await savedShow();
    const session = store.session(documentId)!;
    session.execute("output.create", { id: "out_c", name: "Floor" }, "test");
    await store.flush();
    expect(await listAutosaves(file)).toHaveLength(1);

    const refused = await store.replaceContent(copy);
    expect(refused).toMatchObject({ ok: false });
    expect(!refused.ok && refused.error).toContain("unsaved changes");
    expect(session.document.outputs.out_c).toBeDefined();

    expect((await store.replaceContent(copy, true)).ok).toBe(true);
    expect(session.document.outputs.out_c).toBeUndefined();
    expect(await listAutosaves(file)).toEqual([]);
    // Dirty like any other change: the sidecar follows.
    await sleep(60);
    expect(await listAutosaves(file)).toHaveLength(1);
  });

  it("rejects text that is not an Installation and leaves the document alone", async () => {
    const { documentId } = await savedShow();
    const before = store.session(documentId)!.document;
    const notJson = await store.replaceContent("not json");
    expect(!notJson.ok && notJson.error).toContain("Not valid JSON");
    const notShow = await store.replaceContent('{"kind":"something"}');
    expect(!notShow.ok && notShow.error).toContain(
      "Not a Difracta Installation file",
    );
    expect(store.session(documentId)!.document).toBe(before);
    expect(store.current()?.dirty).toBe(false);
  });

  it("another Installation keeps its id and takes the session's place, on the same path", async () => {
    const { documentId, file } = await savedShow();
    const other = emptyDocument("Other");
    let changes = 0;
    store.onChange(() => (changes += 1));

    const replaced = await store.replaceContent(serializeDocument(other));
    expect(replaced.ok && replaced.result).toMatchObject({
      id: other.installation.id,
      name: "Other",
      path: file,
      dirty: true,
      revision: 0,
    });
    expect(store.session(documentId)).toBeUndefined();
    expect(changes).toBeGreaterThan(0);

    // The file still holds the first Installation, and revert reopens it.
    const reverted = await store.revert(other.installation.id);
    expect(reverted.ok && reverted.result).toMatchObject({
      id: documentId,
      name: "Show",
      path: file,
      dirty: false,
    });
    expect(store.session(other.installation.id)).toBeUndefined();
    expect(await listAutosaves(file)).toEqual([]);
  });

  it("with nothing open, the file becomes a new unsaved document", async () => {
    const other = emptyDocument("Other");
    const replaced = await store.replaceContent(serializeDocument(other));
    expect(replaced.ok && replaced.result).toMatchObject({
      id: other.installation.id,
      path: null,
      dirty: true,
    });
  });
});
