import { createBuiltInRegistry } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { describeCommand } from "./commands/run.ts";
import { formatSchema, schemaType } from "./schema.ts";

const registry = createBuiltInRegistry();
const fields = (command: string): string[] =>
  formatSchema(describeCommand(registry, command).payload as never);

describe("formatSchema", () => {
  it("lists each field with its type, stars the required ones and shows defaults", () => {
    const lines = fields("layer.create");
    expect(lines).toEqual([
      "id  string",
      'kind*  "visual" | "filter" | "group"',
      "sceneId*  string",
      "parentId  string | null  (default null)",
      "name  string",
      "after  string | null",
      "target  string | null",
    ]);
  });

  it("names colours and ranges, and lists the alternatives an array of actions takes", () => {
    const lines = fields("macro.actions.add");
    expect(lines[0]).toBe("macroId*  string");
    expect(lines[1]).toBe("actions*  object[]");
    expect(lines.slice(2, 5)).toEqual([
      '  · kind*: "set"  address*: string  value*: number | boolean | string | [r, g, b, a]',
      '  · kind*: "toggle"  address*: string',
      '  · kind*: "trigger"  address*: string',
    ]);
    expect(fields("layer.update")).toContain("opacity  number 0..1");
    expect(fields("layer.visual")).toContain(
      "parameters  {<key>: number | string | boolean | [r, g, b, a]}",
    );
  });

  it("types a nested object by its fields", () => {
    expect(fields("surface.corner.set")).toEqual([
      "surfaceId*  string",
      'corner*  "topLeft" | "topRight" | "bottomRight" | "bottomLeft"',
      "point*  object",
      "  x*  number",
      "  y*  number",
    ]);
    expect(schemaType({ type: ["string", "null"] })).toBe("string | null");
  });
});
