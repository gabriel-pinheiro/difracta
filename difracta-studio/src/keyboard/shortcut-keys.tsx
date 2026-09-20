import { useEffect } from "react";

import { useDocumentCommands } from "@/documents/document-commands";
import { shortcuts, type ShortcutName } from "@/shortcuts";

/**
 * Global key handler. Undo and redo stay out of text fields, where the
 * browser's own editing history applies (a slider or a checkbox has none);
 * the file shortcuts work everywhere.
 *
 * This is the only handler of these keys, in a browser and in Difracta
 * Desktop alike. Desktop's native menu shows the same shortcuts beside its
 * items but does not act on them: a page gets a key before the menu does, and
 * `preventDefault()` below ends it here, so nothing can run twice.
 */
export function ShortcutKeys() {
  const commands = useDocumentCommands();
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const name = (Object.keys(shortcuts) as ShortcutName[]).find(
        (candidate) => shortcuts[candidate].matches(event),
      );
      if (name === undefined) return;
      const target = event.target;
      const editing =
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLInputElement &&
          !["range", "checkbox", "radio"].includes(target.type));
      if (editing && (name === "undo" || name === "redo")) return;
      event.preventDefault();
      commands[name]();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commands]);
  return null;
}
