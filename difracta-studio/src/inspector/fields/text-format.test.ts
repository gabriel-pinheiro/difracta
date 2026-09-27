import { describe, expect, it } from "vitest";

import {
  singleLine,
  textKeyAction,
  textPreview,
  textToCommit,
} from "./text-format.ts";

const key = (
  name: string,
  modifiers: { readonly ctrlKey?: boolean; readonly metaKey?: boolean } = {},
) => ({ key: name, ctrlKey: false, metaKey: false, ...modifiers });

describe("text formatting", () => {
  it("puts text on one line, a space for each run of line breaks", () => {
    expect(singleLine("Doors\nat nine")).toBe("Doors at nine");
    expect(singleLine("Doors \r\n\r\n  at nine\n")).toBe("Doors at nine");
    expect(singleLine("Doors")).toBe("Doors");
  });

  it("cuts a preview at its length with an ellipsis, and leaves shorter text alone", () => {
    expect(textPreview("Doors", 12)).toBe("Doors");
    expect(textPreview("Doors at nine", 13)).toBe("Doors at nine");
    expect(textPreview("Doors at nine", 9)).toBe("Doors at…");
    expect(textPreview("Doors\nat nine", 8)).toBe("Doors a…");
    expect(textPreview("", 8)).toBe("");
  });

  it("counts an emoji as one character when it cuts", () => {
    expect(textPreview("🎉🎉🎉🎉", 3)).toBe("🎉🎉…");
  });
});

describe("text editing keys", () => {
  it("commits a single line on Enter", () => {
    expect(textKeyAction(key("Enter"), false)).toBe("commit");
    expect(textKeyAction(key("Enter", { ctrlKey: true }), false)).toBe(
      "commit",
    );
  });

  it("leaves Enter to the line break in a multiline field, and commits on Ctrl+Enter or Cmd+Enter", () => {
    expect(textKeyAction(key("Enter"), true)).toBeUndefined();
    expect(textKeyAction(key("Enter", { ctrlKey: true }), true)).toBe("commit");
    expect(textKeyAction(key("Enter", { metaKey: true }), true)).toBe("commit");
  });

  it("cancels on Escape and ignores every other key", () => {
    expect(textKeyAction(key("Escape"), false)).toBe("cancel");
    expect(textKeyAction(key("Escape"), true)).toBe("cancel");
    expect(textKeyAction(key("a"), false)).toBeUndefined();
    expect(textKeyAction(key("s", { ctrlKey: true }), true)).toBeUndefined();
  });
});

describe("text commit", () => {
  it("sends a changed draft, the empty one included", () => {
    expect(textToCommit("Doors at nine", "Doors", false)).toBe("Doors at nine");
    expect(textToCommit("", "Doors", false)).toBe("");
    expect(textToCommit(" Doors ", "Doors", false)).toBe(" Doors ");
  });

  it("sends nothing when the edit was cancelled or changed nothing", () => {
    expect(textToCommit("Doors at nine", "Doors", true)).toBeUndefined();
    expect(textToCommit("Doors", "Doors", false)).toBeUndefined();
  });
});
