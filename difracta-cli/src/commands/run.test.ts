import { createBuiltInRegistry } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { describeCommand } from "./run.ts";

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
