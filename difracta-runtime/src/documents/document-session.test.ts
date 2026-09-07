import { createBuiltInRegistry, emptyDocument } from "@difracta/core";
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

  it("does not dirty the document or record history for performance commands", () => {
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

  it("reports unknown commands", () => {
    const { doc } = session();
    expect(doc.execute("nope.nothing", {}, "x")).toEqual({
      ok: false,
      error: "Unknown command “nope.nothing”.",
    });
  });
});
