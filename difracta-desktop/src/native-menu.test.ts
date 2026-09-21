import type { MenuItemConstructorOptions } from "electron";
import { describe, expect, it, vi } from "vitest";

import {
  acceleratorFor,
  nativeMenuTemplate,
  type NativeMenuActions,
  type NativeMenuOptions,
} from "./native-menu.ts";

type Item = MenuItemConstructorOptions;

const actions = () => ({
  pageCommand: vi.fn<NativeMenuActions["pageCommand"]>(),
  connectTo: vi.fn(),
  setStartAtLogin: vi.fn(),
  setStartWithoutStudio: vi.fn(),
  zoom: vi.fn(),
  toggleDevTools: vi.fn(),
  reloadStudio: vi.fn(),
  showRuntimeLog: vi.fn(),
});

const page = {
  file: [
    {
      id: "open",
      label: "Open Installation…",
      shortcutLabel: "Ctrl+O",
      enabled: true,
    },
    {
      id: "save",
      label: "Save",
      shortcutLabel: "Ctrl+S",
      enabled: true,
      separatorBefore: true,
    },
    { id: "revert", label: "Revert to Saved", enabled: false },
  ],
  edit: [
    { id: "undo", label: "Undo", shortcutLabel: "Ctrl+Z", enabled: true },
    { id: "redo", label: "Redo", shortcutLabel: "Ctrl+Y", enabled: true },
  ],
};

function template(options: Partial<NativeMenuOptions> = {}): Item[] {
  return nativeMenuTemplate({
    platform: "linux",
    kind: "studio",
    page,
    local: true,
    startup: { startAtLogin: false, startWithoutStudio: false },
    actions: actions(),
    ...options,
  });
}

/** A menu's items by what identifies them: a separator, a role, else the label. */
function shape(menus: Item[], id: string): string[] {
  const submenu = menus.find((menu) => menu.id === id)?.submenu;
  return (Array.isArray(submenu) ? submenu : [])
    .filter((item) => item.visible !== false)
    .map((item) =>
      item.type === "separator" ? "-" : (item.role ?? item.label ?? "?"),
    );
}
const all = (menus: Item[]): Item[] =>
  menus.flatMap((menu) => (Array.isArray(menu.submenu) ? menu.submenu : []));

describe("the native menu", () => {
  it("puts Desktop's items around the page's", () => {
    const menus = template();
    expect(menus.map((menu) => menu.label ?? menu.role)).toEqual([
      "File",
      "Edit",
      "View",
      "help",
    ]);
    expect(shape(menus, "file")).toEqual([
      "Open Installation…",
      "-",
      "Save",
      "Revert to Saved",
      "-",
      "Connect to...",
      "Startup",
      "-",
      "quit",
    ]);
    // One Undo and one Redo: the Installation's, not the text roles too.
    expect(shape(menus, "edit")).toEqual([
      "Undo",
      "Redo",
      "-",
      "cut",
      "copy",
      "paste",
      "selectAll",
    ]);
    expect(shape(menus, "view")).toEqual([
      "Actual Size",
      "Zoom In",
      "Zoom Out",
      "-",
      "togglefullscreen",
    ]);
    expect(shape(menus, "help")).toEqual([
      "Reload Studio",
      "Toggle Developer Tools",
      "Show Runtime Log",
    ]);
  });

  it("shows the page's shortcuts without acting on them, and its enabled state", () => {
    const items = all(template()).filter((item) =>
      item.id?.startsWith("page:"),
    );
    expect(
      items.map((item) => [
        item.id,
        item.accelerator,
        item.registerAccelerator,
        item.enabled,
      ]),
    ).toEqual([
      ["page:open", "CommandOrControl+O", false, true],
      ["page:save", "CommandOrControl+S", false, true],
      ["page:revert", undefined, undefined, false],
      ["page:undo", "CommandOrControl+Z", false, true],
      ["page:redo", "CommandOrControl+Y", false, true],
    ]);
  });

  it("hands a click to the page, told apart from a key", () => {
    const given = actions();
    const save = all(template({ actions: given })).find(
      (item) => item.id === "page:save",
    );
    const click = save?.click as unknown as (
      item: unknown,
      window: unknown,
      event: { triggeredByAccelerator?: boolean },
    ) => void;
    click(undefined, undefined, {});
    click(undefined, undefined, { triggeredByAccelerator: true });
    expect(given.pageCommand).toHaveBeenNthCalledWith(1, "save", false);
    expect(given.pageCommand).toHaveBeenNthCalledWith(2, "save", true);
  });

  it("takes only plain shortcuts from a page, and no mnemonics", () => {
    expect(acceleratorFor("Ctrl+Shift+S")).toBe("CommandOrControl+Shift+S");
    expect(acceleratorFor("Ctrl+Q+Q")).toBeUndefined();
    expect(acceleratorFor("Alt+F4")).toBeUndefined();
    expect(acceleratorFor(undefined)).toBeUndefined();
    const menus = template({
      page: {
        file: [
          {
            id: "x",
            label: "Cut & Run",
            shortcutLabel: "nonsense",
            enabled: true,
          },
        ],
        edit: [],
      },
    });
    const item = all(menus).find((entry) => entry.id === "page:x");
    expect(item?.label).toBe("Cut && Run");
    expect(item?.accelerator).toBeUndefined();
  });

  it("has no Close Window and no Window menu on Windows and Linux", () => {
    for (const platform of ["linux", "win32"] as const) {
      const menus = template({ platform });
      expect(all(menus).map((item) => item.role)).not.toContain("close");
      expect(menus.map((menu) => menu.role)).not.toContain("windowMenu");
      expect(menus.map((menu) => menu.role)).not.toContain("appMenu");
    }
  });

  it("keeps the macOS conventions", () => {
    const menus = template({ platform: "darwin" });
    expect(menus.map((menu) => menu.label ?? menu.role)).toEqual([
      "appMenu",
      "File",
      "Edit",
      "View",
      "windowMenu",
      "help",
    ]);
    // Quit is in the application menu there.
    expect(shape(menus, "file").slice(-4)).toEqual([
      "Connect to...",
      "Startup",
      "-",
      "close",
    ]);
  });

  it("shows the runtime's log only for the runtime on this computer", () => {
    expect(shape(template({ local: false }), "help")).toEqual([
      "Reload Studio",
      "Toggle Developer Tools",
    ]);
  });

  it("has the two checkboxes of the next start, as they are now", () => {
    const startupItems = (options: Partial<NativeMenuOptions>): Item[] => {
      const startup = all(template(options)).find(
        (item) => item.id === "desktop:startup",
      )?.submenu;
      return Array.isArray(startup) ? startup : [];
    };
    const facts = (items: Item[]) =>
      items.map((item) => [item.label, item.type, item.checked, item.enabled]);

    expect(facts(startupItems({}))).toEqual([
      ["Start at Login", "checkbox", false, undefined],
      ["Start Without Studio Window", "checkbox", false, true],
    ]);
    // Only a runtime on this computer can run without the Studio window.
    expect(
      facts(
        startupItems({
          local: false,
          startup: { startAtLogin: true, startWithoutStudio: true },
        }),
      ),
    ).toEqual([
      ["Start at Login", "checkbox", true, undefined],
      ["Start Without Studio Window", "checkbox", true, false],
    ]);

    // A click hands on what the checkbox became.
    const given = actions();
    const [login, withoutStudio] = startupItems({ actions: given });
    const click = (item: Item | undefined, checked: boolean): void =>
      (item?.click as unknown as (item: { checked: boolean }) => void)({
        checked,
      });
    click(login, true);
    click(withoutStudio, false);
    expect(given.setStartAtLogin).toHaveBeenCalledWith(true);
    expect(given.setStartWithoutStudio).toHaveBeenCalledWith(false);
  });

  it("works before the page has described anything, or when it never does", () => {
    const menus = template({ page: { file: [], edit: [] } });
    expect(shape(menus, "file")).toEqual([
      "Connect to...",
      "Startup",
      "-",
      "quit",
    ]);
    expect(shape(menus, "edit")).toEqual(["cut", "copy", "paste", "selectAll"]);
  });

  it("gives the launch window a small menu with nothing of a page", () => {
    const menus = template({ kind: "launch" });
    expect(shape(menus, "file")).toEqual(["quit"]);
    expect(shape(menus, "edit")).toEqual([
      "undo",
      "redo",
      "-",
      "cut",
      "copy",
      "paste",
      "selectAll",
    ]);
    expect(shape(menus, "help")).toEqual(["Toggle Developer Tools"]);
    expect(all(menus).some((item) => item.id?.startsWith("page:"))).toBe(false);
  });

  it("uses plain ASCII in its own labels", () => {
    for (const item of all(template({ page: { file: [], edit: [] } })))
      expect(item.label ?? "").toMatch(/^[\x20-\x7e]*$/);
  });
});
