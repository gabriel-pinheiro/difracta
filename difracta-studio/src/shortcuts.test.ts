import { describe, expect, it } from "vitest";

import { shortcuts } from "./shortcuts";

const press = (
  key: string,
  modifiers: Partial<Record<"ctrlKey" | "shiftKey" | "altKey", boolean>> = {},
): KeyboardEvent =>
  ({
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...modifiers,
  }) as KeyboardEvent;

describe("shortcuts", () => {
  it("redoes on Ctrl+Y and on Ctrl+Shift+Z, showing Ctrl+Y", () => {
    expect(shortcuts.redo.label).toBe("Ctrl+Y");
    expect(shortcuts.redo.matches(press("y", { ctrlKey: true }))).toBe(true);
    expect(
      shortcuts.redo.matches(press("Z", { ctrlKey: true, shiftKey: true })),
    ).toBe(true);
    expect(shortcuts.redo.matches(press("z", { ctrlKey: true }))).toBe(false);
    expect(shortcuts.undo.matches(press("z", { ctrlKey: true }))).toBe(true);
  });

  it("removes on Delete or Backspace without modifiers", () => {
    expect(shortcuts.remove.label).toBe("Del");
    expect(shortcuts.remove.matches(press("Delete"))).toBe(true);
    expect(shortcuts.remove.matches(press("Backspace"))).toBe(true);
    expect(shortcuts.remove.matches(press("Delete", { ctrlKey: true }))).toBe(
      false,
    );
  });
});
