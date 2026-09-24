import { describe, expect, it } from "vitest";

import { chooseOutput } from "./output-choice.ts";

const outputs = [
  { id: "output_a", name: "Output 1" },
  { id: "output_b", name: "Stage Left" },
  { id: "output_c", name: "Stage Left " },
];

describe("chooseOutput", () => {
  it("keeps an id as it is", () => {
    expect(chooseOutput(outputs, "output_b")).toEqual({
      kind: "found",
      id: "output_b",
    });
  });

  it("resolves a name to its Output's id, like the CLI", () => {
    expect(chooseOutput(outputs, "Output 1")).toEqual({
      kind: "found",
      id: "output_a",
    });
    expect(chooseOutput(outputs, " output 1")).toEqual({
      kind: "found",
      id: "output_a",
    });
  });

  it("prefers an id over a name that happens to equal it", () => {
    const tricky = [...outputs, { id: "output_d", name: "output_a" }];
    expect(chooseOutput(tricky, "output_a")).toEqual({
      kind: "found",
      id: "output_a",
    });
  });

  it("reports a value nothing is called or identified by", () => {
    expect(chooseOutput(outputs, "output_nope")).toEqual({ kind: "unknown" });
    expect(chooseOutput([], "Output 1")).toEqual({ kind: "unknown" });
  });

  it("refuses a name several Outputs carry", () => {
    expect(chooseOutput(outputs, "stage left")).toEqual({
      kind: "ambiguous",
      matches: [outputs[1], outputs[2]],
    });
  });

  it("treats markup in the value as an unknown name, never as HTML", () => {
    expect(
      chooseOutput(outputs, "<img src=x onerror=alert(document.domain)>"),
    ).toEqual({ kind: "unknown" });
  });
});
