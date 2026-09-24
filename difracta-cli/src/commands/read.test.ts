import { describe, expect, it } from "vitest";

import { addressLabel, formatTable } from "./read.ts";

describe("addresses listing", () => {
  it("labels a row with its owner so same-labelled rows differ", () => {
    expect(addressLabel({ owner: "Energy 1", label: "Value" })).toBe(
      "Energy 1 · Value",
    );
    expect(addressLabel({ owner: "Scene 1", label: "Play" })).toBe(
      "Scene 1 · Play",
    );
    expect(addressLabel({ label: "Blackout" })).toBe("Blackout");
  });

  it("sizes each column to its widest cell", () => {
    expect(
      formatTable([
        ["installation/blackout", "boolean", "false", "Blackout", ""],
        [
          "surface/surface_ab12/render-scale",
          "number",
          "1",
          "Wall · Render Scale",
          "",
        ],
        ["controller/c/value", "number", "0.5", "Energy · Value", "← x"],
      ]),
    ).toBe(
      [
        "installation/blackout              boolean  false  Blackout",
        "surface/surface_ab12/render-scale  number   1      Wall · Render Scale",
        "controller/c/value                 number   0.5    Energy · Value       ← x",
      ].join("\n"),
    );
  });
});
