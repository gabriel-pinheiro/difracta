import { Menu, shell, type MenuItemConstructorOptions } from "electron";

/**
 * The native menu, made of Electron's roles: items whose label, shortcut and
 * behaviour Electron supplies per platform. The Edit roles are what make
 * copy, paste and undo work in text fields on macOS, and macOS expects the
 * application menu first.
 *
 * Documents (New, Open, Save…) are not here: Studio's own menu bar has them,
 * the same in a browser and in Desktop, and one handler per shortcut means
 * Ctrl+S can never save twice. A page sees a key before the menu does, so
 * Studio's Ctrl+Z still undoes in the Installation and Edit ▸ Undo's only
 * acts in a text field.
 *
 * The Runtime menu is Desktop's own: where Studio is coming from, and the way
 * back to the launch page. It is here and not in Studio because it is about
 * the app, not the Installation, and has to work whichever runtime's Studio
 * is showing. A menu cannot be edited once set, so this is called again
 * whenever `where` changes.
 */
export function installApplicationMenu(options: {
  readonly runtimeLog: string;
  /** "This computer", "stage-pc — 10.0.0.5:4800"; undefined on the launch page. */
  readonly where: string | undefined;
  readonly onSwitch: () => void;
}): void {
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === "darwin" ? [{ role: "appMenu" as const }] : []),
    { role: "fileMenu" },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        // The role's shortcut is Ctrl+Plus, which is Ctrl+Shift+= on most
        // layouts; browsers also take the bare Ctrl+=, so a hidden twin does.
        { role: "zoomIn", accelerator: "CommandOrControl+=", visible: false },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Runtime",
      submenu: [
        { label: options.where ?? "Not connected", enabled: false },
        { type: "separator" },
        {
          label: "Switch…",
          enabled: options.where !== undefined,
          click: options.onSwitch,
        },
      ],
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        // Kept in production builds: it is how a problem on someone's rig gets looked at.
        { role: "toggleDevTools" },
        {
          label: "Show Runtime Log",
          click: () => shell.showItemInFolder(options.runtimeLog),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
