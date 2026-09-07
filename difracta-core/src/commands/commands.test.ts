import { describe, expect, it } from "vitest";

import { executeCommand } from "../command/execute.ts";
import { emptyDocument, type Document } from "../document/document.ts";
import { applyPatches } from "../document/patch.ts";
import { createBuiltInRegistry } from "./index.ts";

const registry = createBuiltInRegistry();

function run(document: Document, name: string, payload: unknown) {
  const result = executeCommand(registry, document, name, payload);
  if (!result.ok) throw new Error(result.error);
  return result;
}

describe("built-in commands", () => {
  it("creates, renames and removes Outputs, numbering taken names", () => {
    const start = emptyDocument("Living");
    const created = run(start, "output.create", {
      id: "out_a",
      name: "Projector",
    });
    expect(created.document.outputs.out_a).toEqual({
      id: "out_a",
      name: "Projector",
    });
    expect(created.label).toBe("Create Output “Projector”");

    const numbered = run(created.document, "output.create", {
      id: "out_b",
      name: "projector",
    });
    expect(numbered.document.outputs.out_b?.name).toBe("projector 1");
    const renamedIntoClash = run(numbered.document, "output.rename", {
      outputId: "out_b",
      name: "Projector",
    });
    expect(renamedIntoClash.document.outputs.out_b?.name).toBe("Projector 1");
    const keepsOwnName = run(numbered.document, "output.rename", {
      outputId: "out_a",
      name: "Projector",
    });
    expect(keepsOwnName.patches).toEqual([]);

    const renamed = run(created.document, "output.rename", {
      outputId: "out_a",
      name: "TV",
    });
    expect(renamed.document.outputs.out_a?.name).toBe("TV");
    expect(renamed.coalesceKey).toBe("output.rename:out_a");
    expect(applyPatches(renamed.document, renamed.inverse)).toEqual(
      created.document,
    );

    const removed = run(renamed.document, "output.remove", {
      outputId: "out_a",
    });
    expect(removed.document.outputs).toEqual({});
    expect(applyPatches(removed.document, removed.inverse)).toEqual(
      renamed.document,
    );
  });

  it("rejects malformed payloads before apply runs", () => {
    const result = executeCommand(
      registry,
      emptyDocument("x"),
      "output.create",
      { name: "" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Invalid payload");
  });

  it("writes performance values through addresses", () => {
    const start = emptyDocument("Living");
    const on = run(start, "address.set", {
      address: "installation/blackout",
      value: true,
    });
    expect(on.document.operational.blackout).toBe(true);
    expect(on.definition.kind).toBe("performance");

    const wrongType = executeCommand(registry, start, "address.set", {
      address: "installation/blackout",
      value: 1,
    });
    expect(wrongType.ok).toBe(false);

    const toggled = run(on.document, "address.toggle", {
      address: "installation/blackout",
    });
    expect(toggled.document.operational.blackout).toBe(false);
  });

  it("produces no patches for a no-op", () => {
    const start = emptyDocument("Living");
    const same = run(start, "installation.rename", { name: "Living" });
    expect(same.patches).toEqual([]);
    expect(same.document).toBe(start);
  });
});
