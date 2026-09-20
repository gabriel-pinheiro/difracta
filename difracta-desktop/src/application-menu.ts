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
 */
export function installApplicationMenu(options: {
  readonly runtimeLog: string;
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
