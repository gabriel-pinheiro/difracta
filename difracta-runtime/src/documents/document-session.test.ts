import {
  applyPatches,
  createBuiltInRegistry,
  emptyDocument,
} from "@difracta/core";
import { describe, expect, it } from "vitest";

import { DocumentSession, type DocumentDelta } from "./document-session.ts";

function session() {
  const doc = new DocumentSession(
    emptyDocument("Living"),
    createBuiltInRegistry(),
  );
  const deltas: DocumentDelta[] = [];
  doc.onDelta((delta) => deltas.push(delta));
  return { doc, deltas };
}

describe("DocumentSession", () => {
  it("executes commands, advances revision and emits one delta each", () => {
    const { doc, deltas } = session();
    const created = doc.execute(
      "output.create",
      { id: "out_a", name: "TV" },
      "studio",
    );
    expect(created).toEqual({
      ok: true,
      revision: 1,
      changed: true,
      label: "Create Output “TV”",
      created: [{ table: "outputs", id: "out_a" }],
    });
    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toMatchObject({
      fromRevision: 0,
      revision: 1,
      originSessionId: "studio",
    });
    expect(doc.dirty).toBe(true);
    expect(doc.summary().outputs).toEqual([{ id: "out_a", name: "TV" }]);
  });

  it("dirties only for saved state, and records history only for authoring", () => {
    const { doc } = session();
    const result = doc.execute(
      "address.set",
      { address: "installation/blackout", value: true },
      "osc",
    );
    expect(result.ok).toBe(true);
    expect(doc.dirty).toBe(false);
    expect(doc.document.operational.blackout).toBe(true);
    expect(doc.execute("history.undo", {}, "osc")).toEqual({
      ok: false,
      error: "Nothing to undo.",
    });
    // A played Scene is saved with the file: dirty, still not undoable.
    doc.execute("scene.create", { id: "s1", name: "One" }, "studio");
    doc.execute("scene.create", { id: "s2", name: "Two" }, "studio");
    doc.markSaved();
    expect(doc.dirty).toBe(false);
    expect(doc.execute("scene.play", { sceneId: "s2" }, "osc").ok).toBe(true);
    expect(doc.dirty).toBe(true);
    expect(doc.document.installation.activeScene).toBe("s2");
    expect(doc.execute("history.undo", {}, "osc")).toEqual({
      ok: false,
      error: "Nothing to undo.",
    });
  });

  it("undoes and redoes per session", () => {
    const { doc, deltas } = session();
    doc.execute("output.create", { id: "out_a", name: "TV" }, "studio");
    doc.execute(
      "output.rename",
      { outputId: "out_a", name: "Projector" },
      "cli",
    );

    expect(doc.execute("history.undo", {}, "studio").ok).toBe(false); // cli renamed it after
    const cliUndo = doc.execute("history.undo", {}, "cli");
    expect(cliUndo).toMatchObject({ ok: true, label: "Rename Output" });
    expect(doc.document.outputs.out_a?.name).toBe("TV");

    const studioUndo = doc.execute("history.undo", {}, "studio");
    expect(studioUndo.ok).toBe(true);
    expect(doc.document.outputs).toEqual({});
    expect(deltas.at(-1)?.patches).toEqual([
      { op: "remove", path: ["outputs", "out_a"] },
    ]);

    expect(doc.execute("history.redo", {}, "studio").ok).toBe(true);
    expect(doc.document.outputs.out_a?.name).toBe("TV");
  });

  it("replaceDocument sets every table, so a replica catches up in one delta", () => {
    const { doc, deltas } = session();
    doc.execute("output.create", { id: "out_a", name: "TV" }, "studio");
    doc.execute("scene.create", { id: "s1", name: "One" }, "studio");
    doc.execute(
      "address.set",
      { address: "installation/blackout", value: true },
      "osc",
    );
    const replica = doc.document;

    const other = new DocumentSession(
      { ...emptyDocument("Living"), installation: replica.installation },
      createBuiltInRegistry(),
    );
    other.execute("surface.create", { id: "sur_a", name: "Wall" }, "studio");
    other.execute("scene.create", { id: "s2", name: "Two" }, "studio");
    other.execute(
      "layer.create",
      { id: "v", sceneId: "s2", kind: "visual" },
      "studio",
    );
    const next = other.document;

    doc.replaceDocument(next, "runtime");
    const delta = deltas.at(-1)!;
    expect(delta.patches.map((patch) => patch.path)).toEqual(
      Object.keys(next)
        .filter((table) => table !== "operational")
        .map((table) => [table]),
    );
    const caughtUp = applyPatches(replica, delta.patches);
    expect(caughtUp).toEqual({ ...next, operational: replica.operational });
    expect(caughtUp.operational.blackout).toBe(true);
    expect(doc.document).toEqual(caughtUp);
    expect(doc.dirty).toBe(false);
  });

  it("reports every entity a command adds, whatever the command", () => {
    const { doc } = session();
    doc.execute("scene.create", { id: "s1", name: "One" }, "studio");
    doc.execute(
      "layer.create",
      { id: "v", sceneId: "s1", kind: "visual", name: "Wash" },
      "studio",
    );
    const duplicated = doc.execute(
      "scene.duplicate",
      { sceneId: "s1", id: "s2" },
      "studio",
    );
    expect(duplicated.ok && duplicated.created).toEqual([
      { table: "scenes", id: "s2" },
      { table: "layers", id: expect.stringMatching(/^layer_/) as string },
    ]);
    // A change to an existing entity creates nothing, and says so by omission.
    const renamed = doc.execute(
      "scene.rename",
      { sceneId: "s1", name: "First" },
      "studio",
    );
    expect(renamed.ok && "created" in renamed).toBe(false);
  });

  it("lists every payload problem, not only the first", () => {
    const { doc } = session();
    expect(doc.execute("layer.create", {}, "x")).toEqual({
      ok: false,
      error:
        'Invalid payload for “layer.create”: payload.kind: Invalid option: expected one of "visual"|"filter"|"group"; payload.sceneId: Invalid input: expected string, received undefined',
      issues: [
        'payload.kind: Invalid option: expected one of "visual"|"filter"|"group"',
        "payload.sceneId: Invalid input: expected string, received undefined",
      ],
    });
  });

  it("reports unknown commands", () => {
    const { doc } = session();
    expect(doc.execute("nope.nothing", {}, "x")).toEqual({
      ok: false,
      error: "Unknown command “nope.nothing”.",
    });
  });
});
