import { settings } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { parsePageMenu } from "./page-menu.ts";

const save = { id: "save", label: "Save", enabled: true };

describe("the menu a page sends", () => {
  it("is taken when it has the shape", () => {
    const model = {
      file: [{ ...save, shortcutLabel: "Ctrl+S", separatorBefore: true }],
      edit: [{ id: "undo", label: "Undo", enabled: false }],
    };
    expect(parsePageMenu(model)).toEqual(model);
  });

  it("ignores menus and keys it does not know, for a newer Studio", () => {
    expect(
      parsePageMenu({
        file: [{ ...save, icon: "disk" }],
        tools: [{ id: "x", label: "X", enabled: true }],
      }),
    ).toEqual({ file: [save], edit: [] });
  });

  it("refuses what is not a menu", () => {
    for (const model of [
      undefined,
      null,
      "file",
      [],
      { file: "Save" },
      { file: [{ ...save, enabled: "yes" }] },
      { file: [{ ...save, id: 7 }] },
      { file: [{ ...save, id: "a b" }] },
      { file: [{ ...save, label: "" }] },
      { file: [{ ...save, label: { html: "<b>" } }] },
      { edit: [{ ...save, click: "quit" }, { id: "x" }] },
    ])
      expect(parsePageMenu(model)).toBeUndefined();
  });

  it("refuses more than it would ever show", () => {
    const { pageMenuItemsLimit, pageMenuLabelLimit } = settings.desktop;
    const many = Array.from({ length: pageMenuItemsLimit + 1 }, (_, index) => ({
      ...save,
      id: `save-${String(index)}`,
    }));
    expect(parsePageMenu({ file: many })).toBeUndefined();
    expect(parsePageMenu({ file: many.slice(1) })).toBeDefined();
    expect(
      parsePageMenu({
        file: [{ ...save, label: "S".repeat(pageMenuLabelLimit + 1) }],
      }),
    ).toBeUndefined();
    expect(
      parsePageMenu({ file: [{ ...save, id: "i".repeat(65) }] }),
    ).toBeUndefined();
  });
});
