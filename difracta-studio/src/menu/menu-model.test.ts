import { describe, expect, it, vi } from "vitest";

import {
  menuModel,
  runMenuCommand,
  type MenuCommands,
  type MenuItemModel,
} from "./menu-model";

const saved = { path: "/shows/living.difracta", dirty: false };
const labels = (items: readonly MenuItemModel[]): string[] =>
  items.flatMap((item) => [
    ...(item.separatorBefore === true ? ["-"] : []),
    `${item.label}${item.shortcutLabel === undefined ? "" : ` [${item.shortcutLabel}]`}`,
  ]);
const disabled = (items: readonly MenuItemModel[]): string[] =>
  items.filter((item) => !item.enabled).map((item) => item.id);

describe("Studio's menu model", () => {
  it("has every item on a free connection, in the bar's order", () => {
    const model = menuModel({
      free: true,
      connected: true,
      document: saved,
      removable: true,
    });
    expect(labels(model.file)).toEqual([
      "New Installation…",
      "Open Installation… [Ctrl+O]",
      "-",
      "Save [Ctrl+S]",
      "Save As… [Ctrl+Shift+S]",
      "Revert to Saved",
      "-",
      "Download a Copy",
      "Replace from File…",
      "-",
      "Close Installation",
    ]);
    expect(labels(model.edit)).toEqual([
      "Undo [Ctrl+Z]",
      "Redo [Ctrl+Y]",
      "-",
      "Remove [Del]",
    ]);
    // Clean, so there is nothing to revert to.
    expect(disabled([...model.file, ...model.edit])).toEqual(["revert"]);
  });

  it("leaves out what a pinned connection may not do", () => {
    const model = menuModel({
      free: false,
      connected: true,
      document: saved,
      removable: false,
    });
    expect(labels(model.file)).toEqual([
      "Save [Ctrl+S]",
      "Revert to Saved",
      "-",
      "Download a Copy",
      "Replace from File…",
    ]);
  });

  it("enables Revert only for unsaved changes to a file", () => {
    const revert = (document: { path: string | null; dirty: boolean }) =>
      menuModel({
        free: true,
        connected: true,
        document,
        removable: false,
      }).file.find((item) => item.id === "revert")?.enabled;
    expect(revert({ ...saved, dirty: true })).toBe(true);
    expect(revert(saved)).toBe(false);
    expect(revert({ path: null, dirty: true })).toBe(false);
  });

  it("disables what needs an Installation when none is open", () => {
    const model = menuModel({
      free: true,
      connected: true,
      document: undefined,
      removable: false,
    });
    expect(disabled([...model.file, ...model.edit])).toEqual([
      "save",
      "saveAs",
      "revert",
      "downloadCopy",
      "close",
      "undo",
      "redo",
      "remove",
    ]);
  });

  it("disables what needs the runtime while disconnected", () => {
    const model = menuModel({
      free: true,
      connected: false,
      document: saved,
      removable: false,
    });
    expect(disabled(model.file)).toEqual([
      "create",
      "open",
      "revert",
      "replaceFromFile",
    ]);
  });

  it("is the same text for the same state, so it is sent to Desktop once", () => {
    const input = {
      free: true,
      connected: true,
      document: saved,
      removable: false,
    };
    expect(JSON.stringify(menuModel(input))).toBe(
      JSON.stringify(menuModel({ ...input, document: { ...saved } })),
    );
  });

  it("runs the command an id names, and nothing for any other", () => {
    const commands = { save: vi.fn(), undo: vi.fn() };
    const all = commands as unknown as MenuCommands;
    runMenuCommand("save", all);
    runMenuCommand("selected", all);
    runMenuCommand("constructor", all);
    expect(commands.save).toHaveBeenCalledOnce();
    expect(commands.undo).not.toHaveBeenCalled();
  });

  it("enables Remove only for a removable selection", () => {
    const remove = (removable: boolean) =>
      menuModel({
        free: true,
        connected: true,
        document: saved,
        removable,
      }).edit.find((item) => item.id === "remove")?.enabled;
    expect(remove(true)).toBe(true);
    expect(remove(false)).toBe(false);
  });
});
