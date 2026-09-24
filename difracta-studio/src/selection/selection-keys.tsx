import { useEffect } from "react";

import { keyBelongsElsewhere } from "@/keyboard/key-target";

import { useSelection } from "./selection";

/** Escape clears the selection, unless a text field or an open dialog is using it. */
export function SelectionKeys() {
  const { select } = useSelection();
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (keyBelongsElsewhere(event)) return;
      select(undefined);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [select]);
  return null;
}
