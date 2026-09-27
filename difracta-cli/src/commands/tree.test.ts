import {
  createBuiltInRegistry,
  emptyDocument,
  executeCommand,
  type Document,
} from "@difracta/core";
import { describe, expect, it } from "vitest";

import { formatOscLeaf, oscLeaves } from "./tree.ts";

function stage(): Document {
  const registry = createBuiltInRegistry();
  let document = emptyDocument("Living");
  for (const [name, payload] of [
    ["macro.create", { id: "hit", name: "Hit" }],
    ["controller.create", { id: "words", kind: "text", name: "Words" }],
    ["controller.create", { id: "g", kind: "group", name: "Looks" }],
    [
      "controller.create",
      { id: "tint", kind: "color", name: "Tint", parentId: "g" },
    ],
    ["controller.create", { id: "energy", kind: "number", name: "Energy" }],
    [
      "address.set",
      { address: "controller/words/value", value: "Boa noite\nLisboa" },
    ],
  ] as const) {
    const result = executeCommand(registry, document, name, payload);
    if (!result.ok) throw new Error(result.error);
    document = result.document;
  }
  return document;
}

describe("oscLeaves", () => {
  it("lists a leaf per Controller with its OSC type, then per Macro; Groups are none", () => {
    expect(oscLeaves(stage())).toEqual([
      {
        path: "/controller/energy",
        type: "f",
        description: "Energy",
        value: 0,
      },
      {
        path: "/controller/tint",
        type: "r",
        description: "Looks · Tint",
        value: [1, 1, 1, 1],
      },
      {
        path: "/controller/words",
        type: "s",
        description: "Words",
        value: "Boa noite\nLisboa",
      },
      { path: "/macro/hit", type: "I", description: "Hit" },
    ]);
  });

  it("prints each on one line, text quoted with its line breaks escaped", () => {
    expect(oscLeaves(stage()).map(formatOscLeaf)).toEqual([
      `${"/controller/energy".padEnd(36)} f  Energy  0`,
      `${"/controller/tint".padEnd(36)} r  Looks · Tint  [1,1,1,1]`,
      `${"/controller/words".padEnd(36)} s  Words  "Boa noite\\nLisboa"`,
      `${"/macro/hit".padEnd(36)} I  Hit`,
    ]);
  });
});
