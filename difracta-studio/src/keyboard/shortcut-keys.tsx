import { useEffect } from "react";

import { useDocumentCommands } from "@/documents/document-commands";
import { shortcuts, type ShortcutName } from "@/shortcuts";

/**
 * Global key handler. Undo and redo stay out of text fields, where the
 * browser's own editing history applies; the file shortcuts work everywhere.
 */
export function ShortcutKeys() {
  const commands = useDocumentCommands();
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const name = (Object.keys(shortcuts) as ShortcutName[]).find(
        (candidate) => shortcuts[candidate].matches(event),
      );
      if (name === undefined) return;
      const target = event.target as HTMLElement | null;
      const editing =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if (editing && (name === "undo" || name === "redo")) return;
      event.preventDefault();
      commands[name]();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commands]);
  return null;
}
