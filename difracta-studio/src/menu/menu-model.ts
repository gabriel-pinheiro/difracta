import type { DocumentCommands } from "../documents/document-commands";
import { shortcuts } from "../shortcuts";

/**
 * Studio's File and Edit menus as plain data. Two renderers draw it: the
 * in-page bar (`menu-bar.tsx`) in a browser, and Difracta Desktop's native
 * menu, which gets this same object through `window.difractaMenu`
 * (`menu-bridge.ts`). A new menu item is added here, never to one renderer,
 * so the two can not drift apart.
 *
 * It crosses a process boundary as JSON, so it holds no functions: an item
 * names its command by `id`, and `runMenuCommand` is the one place an id
 * becomes a call, whichever renderer the click came from.
 */
export interface MenuItemModel {
  readonly id: MenuCommandId;
  readonly label: string;
  /** Shown beside the label. The key itself is handled in `keyboard/shortcut-keys.tsx`, nowhere else. */
  readonly shortcutLabel?: string;
  readonly enabled: boolean;
  readonly separatorBefore?: boolean;
}

export interface MenuModel {
  readonly file: readonly MenuItemModel[];
  readonly edit: readonly MenuItemModel[];
}

/** Each id is the `DocumentCommands` function the item runs. */
export type MenuCommandId =
  | "create"
  | "open"
  | "save"
  | "saveAs"
  | "revert"
  | "downloadCopy"
  | "replaceFromFile"
  | "close"
  | "undo"
  | "redo";

const commandIds: ReadonlySet<string> = new Set<MenuCommandId>([
  "create",
  "open",
  "save",
  "saveAs",
  "revert",
  "downloadCopy",
  "replaceFromFile",
  "close",
  "undo",
  "redo",
]);

export interface MenuModelInput {
  /** Whether the runtime lets this connection replace the document; a pinned one has no New, Open, Save As or Close. */
  readonly free: boolean;
  readonly connected: boolean;
  /** The open Installation, as far as the menu cares. */
  readonly document:
    { readonly path: string | null; readonly dirty: boolean } | undefined;
}

export function menuModel(input: MenuModelInput): MenuModel {
  const { free, connected, document } = input;
  const open = document !== undefined;
  const canRevert = document?.dirty === true && document.path !== null;
  const whenFree = (items: MenuItemModel[]): MenuItemModel[] =>
    free ? items : [];

  return {
    file: [
      ...whenFree([
        { id: "create", label: "New Installation…", enabled: connected },
        {
          id: "open",
          label: "Open Installation…",
          shortcutLabel: shortcuts.open.label,
          enabled: connected,
        },
      ]),
      {
        id: "save",
        label: "Save",
        shortcutLabel: shortcuts.save.label,
        enabled: open,
        ...(free ? { separatorBefore: true } : {}),
      },
      ...whenFree([
        {
          id: "saveAs",
          label: "Save As…",
          shortcutLabel: shortcuts.saveAs.label,
          enabled: open,
        },
      ]),
      { id: "revert", label: "Revert to Saved", enabled: canRevert },
      {
        id: "downloadCopy",
        label: "Download a Copy",
        enabled: open,
        separatorBefore: true,
      },
      {
        id: "replaceFromFile",
        label: "Replace from File…",
        enabled: connected,
      },
      ...whenFree([
        {
          id: "close",
          label: "Close Installation",
          enabled: open,
          separatorBefore: true,
        },
      ]),
    ],
    edit: [
      {
        id: "undo",
        label: "Undo",
        shortcutLabel: shortcuts.undo.label,
        enabled: open,
      },
      {
        id: "redo",
        label: "Redo",
        shortcutLabel: shortcuts.redo.label,
        enabled: open,
      },
    ],
  };
}

/**
 * Runs the command behind a menu item. `id` is a string because a click in
 * the native menu comes back over IPC; one that names no command does nothing.
 */
export function runMenuCommand(id: string, commands: DocumentCommands): void {
  if (commandIds.has(id)) commands[id as MenuCommandId]();
}
