/**
 * Keyboard shortcuts, defined once so the menu shows the same label the key
 * handler matches. Ctrl on Windows and Linux, Cmd on macOS.
 */
export interface Shortcut {
  readonly label: string;
  matches(event: KeyboardEvent): boolean;
}

function combo(
  key: string,
  options: { readonly shift?: boolean } = {},
): Shortcut {
  const shift = options.shift ?? false;
  return {
    label: `Ctrl+${shift ? "Shift+" : ""}${key.toUpperCase()}`,
    matches: (event) =>
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      event.shiftKey === shift &&
      event.key.toLowerCase() === key,
  };
}

export const shortcuts = {
  open: combo("o"),
  save: combo("s"),
  saveAs: combo("s", { shift: true }),
  undo: combo("z"),
  redo: combo("y"),
} as const;

export type ShortcutName = keyof typeof shortcuts;
