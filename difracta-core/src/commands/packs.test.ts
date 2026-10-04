import { describe, expect, it } from "vitest";

import { executeCommand } from "../command/execute.ts";
import { emptyDocument, type Document } from "../document/document.ts";
import { createBuiltInRegistry } from "./index.ts";

const registry = createBuiltInRegistry();

function run(document: Document, name: string, payload: unknown) {
  const result = executeCommand(registry, document, name, payload);
  if (!result.ok) throw new Error(result.error);
  return result;
}
function refuse(document: Document, name: string, payload: unknown): string {
  const result = executeCommand(registry, document, name, payload);
  if (result.ok) throw new Error(`${name} was accepted.`);
  return result.error;
}

describe("Packs of an Installation", () => {
  it("are attached by id with a copy of their name and a normalized relative hint", () => {
    const result = run(emptyDocument("Living"), "packs.attach", {
      packId: "neon-k7f3",
      name: "Neon VJ",
      relativePath: "..\\media\\./neon",
    });
    expect(result.patches).toEqual([
      {
        op: "set",
        path: ["packs", "neon-k7f3"],
        value: {
          id: "neon-k7f3",
          name: "Neon VJ",
          relativePath: "../media/neon",
        },
      },
    ]);
    const plain = run(result.document, "packs.attach", {
      packId: "tunnels-9x2a",
      name: "Tunnels",
    });
    expect(plain.document.packs["tunnels-9x2a"]).toEqual({
      id: "tunnels-9x2a",
      name: "Tunnels",
    });
    expect(
      refuse(plain.document, "packs.attach", {
        packId: "neon-k7f3",
        name: "Again",
      }),
    ).toContain("already attached");
    expect(
      refuse(plain.document, "packs.attach", {
        packId: "bundled",
        name: "Bundled",
      }),
    ).toContain("Bundled Pack");
    expect(() =>
      run(plain.document, "packs.attach", { packId: "Neon", name: "Neon" }),
    ).toThrow();
  });

  it("are renamed and detached without touching Layers", () => {
    let document = emptyDocument("Living");
    document = run(document, "packs.attach", {
      packId: "neon-k7f3",
      name: "Neon",
    }).document;
    document = run(document, "scene.create", {
      id: "scene",
      name: "Main",
    }).document;
    document = run(document, "layer.create", {
      id: "l",
      sceneId: "scene",
      kind: "visual",
    }).document;
    const renamed = run(document, "packs.rename", {
      packId: "neon-k7f3",
      name: "Neon VJ",
    });
    expect(renamed.patches).toEqual([
      { op: "set", path: ["packs", "neon-k7f3", "name"], value: "Neon VJ" },
    ]);
    expect(
      run(renamed.document, "packs.rename", {
        packId: "neon-k7f3",
        name: "Neon VJ",
      }).patches,
    ).toEqual([]);
    const detached = run(renamed.document, "packs.detach", {
      packId: "neon-k7f3",
    });
    expect(detached.patches).toEqual([
      { op: "remove", path: ["packs", "neon-k7f3"] },
    ]);
    expect(detached.document.layers.l).toEqual(document.layers.l);
    expect(
      refuse(detached.document, "packs.detach", { packId: "neon-k7f3" }),
    ).toContain("not attached");
    expect(
      refuse(detached.document, "packs.rename", {
        packId: "bundled",
        name: "x",
      }),
    ).toContain("Bundled Pack");
    expect(
      refuse(detached.document, "packs.detach", { packId: "bundled" }),
    ).toContain("Bundled Pack");
  });
});
