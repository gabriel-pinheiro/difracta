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

/** Either shortcut; the menu shows the first one's label. */
function either(first: Shortcut, second: Shortcut): Shortcut {
  return {
    label: first.label,
    matches: (event) => first.matches(event) || second.matches(event),
  };
}

/** Delete, or Backspace for keyboards without a Delete key; no modifiers. */
const deleteKey: Shortcut = {
  label: "Del",
  matches: (event) =>
    (event.key === "Delete" || event.key === "Backspace") &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey,
};

export const shortcuts = {
  open: combo("o"),
  save: combo("s"),
  saveAs: combo("s", { shift: true }),
  undo: combo("z"),
  redo: either(combo("y"), combo("z", { shift: true })),
  remove: deleteKey,
} as const;

export type ShortcutName = keyof typeof shortcuts;
