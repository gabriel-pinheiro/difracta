import { describe, expect, it } from "vitest";

import { parseText, parseValue } from "./connection.ts";

describe("parseValue", () => {
  it("reads true, false, numbers and JSON, and anything else as text", () => {
    expect(parseValue("true")).toBe(true);
    expect(parseValue("0.5")).toBe(0.5);
    expect(parseValue("[1,0.5,0,1]")).toEqual([1, 0.5, 0, 1]);
    expect(parseValue('"one\\ntwo"')).toBe("one\ntwo");
    expect(parseValue("ember")).toBe("ember");
    expect(parseValue("")).toBe("");
  });
});

describe("parseText", () => {
  it("keeps the argument as typed, whatever it looks like", () => {
    for (const typed of [
      "Boa noite",
      "42",
      "true",
      "null",
      "[1,0,0,1]",
      "",
      " padded ",
      "one\ntwo",
      '"',
      'She said "hi"',
      '"unfinished',
    ])
      expect(parseText(typed)).toBe(typed);
  });

  it("reads a JSON string, so line breaks and quotes can be written", () => {
    expect(parseText('"one\\ntwo"')).toBe("one\ntwo");
    expect(parseText('"42"')).toBe("42");
    expect(parseText('""')).toBe("");
    expect(parseText('"She said \\"hi\\""')).toBe('She said "hi"');
    // Quoted, but not JSON: as typed.
    expect(parseText('"a" and "b"')).toBe('"a" and "b"');
  });
});
