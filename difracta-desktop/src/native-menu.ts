import type { BaseWindow, MenuItemConstructorOptions } from "electron";

import type { PageMenu, PageMenuItem } from "./page-menu.ts";
import type { StartupChoices } from "./startup-settings.ts";
import { zoomPercent, type ZoomChange } from "./zoom-levels.ts";

/** What the menu's own items do; `application-menu.ts` fills these in with Electron. */
export interface NativeMenuActions {
  /**
   * An item the page described was chosen. `byKey` says its shortcut did it
   * rather than a click, which only macOS can do: see `pageItem`.
   */
  pageCommand(id: string, byKey: boolean): void;
  connectTo(): void;
  setStartAtLogin(on: boolean): void;
  setStartWithoutStudio(on: boolean): void;
  /** Studio's zoom, in every Studio window whichever window is focused. */
  zoom(change: ZoomChange): void;
  /** `window` is the focused one, which the action checks before it acts. */
  toggleDevTools(window: BaseWindow | undefined): void;
  reloadStudio(): void;
  showRuntimeLog(): void;
}

export interface NativeMenuOptions {
  readonly platform: NodeJS.Platform;
  /** The Studio window's menu, or the launch window's smaller one. */
  readonly kind: "studio" | "launch";
  /** Studio's File and Edit items, as the page last described them; empty until it has. */
  readonly page: PageMenu;
  /** Whether Studio comes from the runtime on this computer, which is the one with a log here. */
  readonly local: boolean;
  /** The two checkboxes of File ▸ Startup, as they really are now. */
  readonly startup: StartupChoices;
  /** Studio's zoom as an Electron level, 0 being 100% (`zoom-levels.ts`). */
  readonly zoomLevel: number;
  readonly actions: NativeMenuActions;
}

type Item = MenuItemConstructorOptions;
const separator: Item = { type: "separator" };

/**
 * A page's "Ctrl+Shift+S" as an Electron accelerator, or undefined when it is
 * not of that plain form: the text comes from a page, and an accelerator
 * Electron cannot parse is an error. `CommandOrControl` shows as Cmd on macOS.
 */
export function acceleratorFor(
  shortcutLabel: string | undefined,
): string | undefined {
  const match = /^Ctrl\+(Shift\+)?(Alt\+)?([A-Z0-9])$/.exec(
    shortcutLabel ?? "",
  );
  if (match === null) return undefined;
  const [, shift = "", alt = "", key = ""] = match;
  return `CommandOrControl+${shift}${alt}${key}`;
}

/**
 * One of the page's items. Its label is plain text to a native menu, with one
 * exception: `&` marks the next letter as the Alt mnemonic on Windows and
 * Linux, and doubling it means a literal one on every platform.
 *
 * The shortcut is for show. Studio's key handler is the only thing that acts
 * on Ctrl+S, the same in a browser: `registerAccelerator: false` makes Windows
 * and Linux print the accelerator without listening for it. macOS has no such
 * switch, but there a key goes to the page first and reaches the menu only
 * when the page did not `preventDefault()` it, which Studio does for every
 * key it handles. What still arrives is reported as `byKey`, so it can be
 * told from a click and never runs the command a second time.
 */
function pageItem(item: PageMenuItem, actions: NativeMenuActions): Item {
  const accelerator = acceleratorFor(item.shortcutLabel);
  return {
    id: `page:${item.id}`,
    label: item.label.replaceAll("&", "&&"),
    enabled: item.enabled,
    ...(accelerator === undefined
      ? {}
      : { accelerator, registerAccelerator: false }),
    click: (_item, _window, event) =>
      actions.pageCommand(item.id, event.triggeredByAccelerator === true),
  };
}

function pageItems(
  items: readonly PageMenuItem[],
  actions: NativeMenuActions,
): Item[] {
  return items.flatMap((item, index) => [
    ...(item.separatorBefore === true && index > 0 ? [separator] : []),
    pageItem(item, actions),
  ]);
}

/** `groups` with a separator between every two that have anything in them. */
function separated(...groups: Item[][]): Item[] {
  return groups
    .filter((group) => group.length > 0)
    .flatMap((group, index) => (index === 0 ? group : [separator, ...group]));
}

/**
 * The native menu as a template for `Menu.buildFromTemplate`: Desktop's own
 * items around the ones the page described. A native menu cannot be edited
 * once set, so this is built again whenever anything it shows changes.
 *
 *   File   [page's]  ─  Connect to..., Startup ▸  ─  Quit
 *   Edit   [page's: Undo and Redo of the Installation]  ─  cut, copy, paste, select all
 *   View   zoom (Studio only)  ─  full screen
 *   Help   Reload Studio, Developer Tools, Show Runtime Log (local only)
 *
 * Roles are items whose label, shortcut and behaviour Electron supplies per
 * platform. The `undo` and `redo` roles are left out next to Studio's own Undo
 * and Redo, because two of each would be a riddle; inside a text field the
 * keys still undo typing, which Chromium does without a menu on Windows and
 * Linux (for macOS see `pageCommand` in `application-menu.ts`). The launch
 * window has no page items, so it gets those roles for its address field.
 *
 * File ▸ Startup holds what applies to the next start, which its name says
 * for both: Start at Login, and Start Without Studio Window, which only a
 * runtime on this computer can do, so it is greyed out beside one elsewhere.
 *
 * Windows and Linux have no Close Window item: closing the Studio window quits
 * Desktop and stops the runtime on this computer, too much for a casual
 * Ctrl+W. macOS keeps its conventions: the application menu first, with Quit
 * in it, Close Window in File, and a Window menu.
 *
 * Zoom and Developer Tools are not roles, because a role acts on whichever
 * window is focused and macOS has one menu for every window. Developer Tools
 * acts on a Studio or launch window only, never on an Output's. Zoom is
 * Studio's setting (`studio-zoom.ts`), whichever window is focused, so only
 * the Studio menu has it: the launch page stays at 100%. Actual Size says the
 * zoom there is now, and is greyed out at 100%.
 */
export function nativeMenuTemplate(options: NativeMenuOptions): Item[] {
  const { platform, kind, page, local, startup, zoomLevel, actions } = options;
  const mac = platform === "darwin";
  const studio = kind === "studio";

  const file = separated(
    studio ? pageItems(page.file, actions) : [],
    studio
      ? [
          {
            id: "desktop:connect-to",
            label: "Connect to...",
            click: () => actions.connectTo(),
          },
          {
            id: "desktop:startup",
            label: "Startup",
            submenu: [
              {
                id: "desktop:start-at-login",
                label: "Start at Login",
                type: "checkbox",
                checked: startup.startAtLogin,
                click: (item) => actions.setStartAtLogin(item.checked),
              },
              {
                id: "desktop:start-without-studio",
                label: "Start Without Studio Window",
                type: "checkbox",
                checked: startup.startWithoutStudio,
                enabled: local,
                click: (item) => actions.setStartWithoutStudio(item.checked),
              },
            ],
          },
        ]
      : [],
    mac ? [{ role: "close" }] : [{ id: "desktop:quit", role: "quit" }],
  );
  const edit = separated(
    studio
      ? pageItems(page.edit, actions)
      : [{ role: "undo" }, { role: "redo" }],
    [
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ],
  );
  const zoom: Item[] = [
    {
      id: "view:actual-size",
      label:
        zoomLevel === 0
          ? "Actual Size"
          : `Actual Size (Now ${String(zoomPercent(zoomLevel))}%)`,
      enabled: zoomLevel !== 0,
      accelerator: "CommandOrControl+0",
      click: () => actions.zoom("reset"),
    },
    {
      id: "view:zoom-in",
      label: "Zoom In",
      accelerator: "CommandOrControl+Plus",
      click: () => actions.zoom("in"),
    },
    // Ctrl+Plus is Ctrl+Shift+= on most layouts; browsers also take the bare
    // Ctrl+=, so a hidden twin does.
    {
      label: "Zoom In",
      accelerator: "CommandOrControl+=",
      visible: false,
      click: () => actions.zoom("in"),
    },
    {
      id: "view:zoom-out",
      label: "Zoom Out",
      accelerator: "CommandOrControl+-",
      click: () => actions.zoom("out"),
    },
  ];
  const view = separated(studio ? zoom : [], [{ role: "togglefullscreen" }]);
  const help: Item[] = [
    ...(studio
      ? [
          {
            id: "help:reload-studio",
            label: "Reload Studio",
            accelerator: "CommandOrControl+R",
            click: () => actions.reloadStudio(),
          },
        ]
      : []),
    // Kept in production builds: it is how a problem on someone's rig gets looked at.
    {
      id: "help:developer-tools",
      label: "Toggle Developer Tools",
      accelerator: mac ? "Alt+Command+I" : "Control+Shift+I",
      click: (_item, window) => actions.toggleDevTools(window),
    },
    ...(studio && local
      ? [
          {
            id: "help:runtime-log",
            label: "Show Runtime Log",
            click: () => actions.showRuntimeLog(),
          },
        ]
      : []),
  ];

  return [
    ...(mac ? [{ role: "appMenu" as const }] : []),
    { id: "file", label: "File", submenu: file },
    { id: "edit", label: "Edit", submenu: edit },
    { id: "view", label: "View", submenu: view },
    ...(mac ? [{ role: "windowMenu" as const }] : []),
    { id: "help", role: "help", submenu: help },
  ];
}
