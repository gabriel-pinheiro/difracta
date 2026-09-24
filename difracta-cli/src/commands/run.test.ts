import {
  createBuiltInRegistry,
  emptyDocument,
  executeCommand,
} from "@difracta/core";
import { describe, expect, it } from "vitest";

import { describeCommand, nameCreated } from "./run.ts";

interface ObjectSchema {
  readonly required?: readonly string[];
  readonly properties: Record<string, unknown>;
}

describe("describeCommand", () => {
  it("requires only what a caller must send: defaulted and optional fields are not required", () => {
    const description = describeCommand(
      createBuiltInRegistry(),
      "layer.create",
    );
    const payload = description.payload as ObjectSchema;
    expect(description.kind).toBe("authoring");
    expect(Object.keys(payload.properties).sort()).toEqual([
      "after",
      "id",
      "kind",
      "name",
      "parentId",
      "sceneId",
      "target",
    ]);
    expect([...(payload.required ?? [])].sort()).toEqual(["kind", "sceneId"]);
  });

  it("names the unknown command and where to look", () => {
    expect(() => describeCommand(createBuiltInRegistry(), "nope.x")).toThrow(
      "Unknown command “nope.x”. Try `difracta commands`.",
    );
  });
});

describe("nameCreated", () => {
  it("names what a create made as it ended up, not as it was asked", () => {
    const registry = createBuiltInRegistry();
    let document = emptyDocument("Living");
    for (const id of ["surface_a", "surface_b"]) {
      const result = executeCommand(registry, document, "surface.create", {
        id,
        name: "Full Frame",
      });
      if (!result.ok) throw new Error(result.error);
      document = result.document;
    }
    expect(
      nameCreated(document, [{ table: "surfaces", id: "surface_b" }]),
    ).toEqual([{ table: "surfaces", id: "surface_b", name: "Full Frame 1" }]);
  });

  it("keeps the bare id when the replica has not caught up", () => {
    expect(
      nameCreated(emptyDocument("Living"), [{ table: "outputs", id: "o" }]),
    ).toEqual([{ table: "outputs", id: "o" }]);
    expect(nameCreated(undefined, [{ table: "outputs", id: "o" }])).toEqual([
      { table: "outputs", id: "o" },
    ]);
  });
});
