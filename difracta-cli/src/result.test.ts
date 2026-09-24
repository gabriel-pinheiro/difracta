import { CommandError } from "@difracta/client";
import { describe, expect, it } from "vitest";

import { errorReport, formatCommandResult, formatWarnings } from "./result.ts";

describe("formatCommandResult", () => {
  it("names what a create made, with the revision", () => {
    expect(
      formatCommandResult(
        {
          revision: 3,
          changed: true,
          label: "Create Output “TV”",
          created: [{ table: "outputs", id: "output_ab12" }],
        },
        "output.create",
      ),
    ).toBe("Create Output “TV” → output_ab12 (revision 3)");
  });

  it("names each created entity as it ended up, which may differ from the label", () => {
    expect(
      formatCommandResult(
        {
          revision: 4,
          changed: true,
          label: "Create Surface “Full Frame”",
          created: [
            { table: "surfaces", id: "surface_ab12", name: "Full Frame 1" },
          ],
        },
        "surface.create",
      ),
    ).toBe(
      "Create Surface “Full Frame” → surface_ab12 “Full Frame 1” (revision 4)",
    );
  });

  it("falls back to the command name and lists warnings underneath", () => {
    expect(
      formatCommandResult(
        {
          revision: 9,
          changed: true,
          warnings: ["Removed 2 Macro actions targeting “Wash”"],
        },
        "layer.remove",
      ),
    ).toBe(
      "layer.remove (revision 9)\n  warning: Removed 2 Macro actions targeting “Wash”",
    );
    expect(formatCommandResult({ revision: 9, changed: false }, "x")).toBe(
      "No change.",
    );
  });

  it("indents warnings", () => {
    expect(formatWarnings(undefined)).toEqual([]);
    expect(formatWarnings(["a"])).toEqual(["  warning: a"]);
  });
});

describe("errorReport", () => {
  it("carries payload issues when the runtime listed them", () => {
    expect(
      errorReport(
        new CommandError("Invalid payload for “layer.create”: a; b", [
          "a",
          "b",
        ]),
      ),
    ).toEqual({
      error: "Invalid payload for “layer.create”: a; b",
      issues: ["a", "b"],
    });
  });

  it("keeps a plain error to its message", () => {
    expect(errorReport(new Error("No value at “layers/nope”."))).toEqual({
      error: "No value at “layers/nope”.",
    });
    expect(errorReport("boom")).toEqual({ error: "boom" });
  });
});
