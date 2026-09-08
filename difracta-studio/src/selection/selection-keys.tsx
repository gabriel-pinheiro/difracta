import { useEffect } from "react";

import { useSelection } from "./selection";

/** Escape clears the selection, unless a text field or an open dialog is using it. */
export function SelectionKeys() {
  const { select } = useSelection();
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true
      )
        return;
      if (document.querySelector('[role="dialog"], [role="menu"]') !== null)
        return;
      select(undefined);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [select]);
  return null;
}
