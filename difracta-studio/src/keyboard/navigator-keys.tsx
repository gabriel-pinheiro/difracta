import { useEffect } from "react";

import {
  arrowStep,
  type RowArrow,
  type VisibleRow,
} from "@/navigator/row-navigation";

import { keyBelongsElsewhere } from "./key-target";

const arrows: ReadonlySet<string> = new Set<RowArrow>([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

/**
 * Arrow keys move the selection through the navigator's rows (`arrowStep`),
 * while focus is in the navigator or on nothing at all; the inspector follows,
 * and focus stays on the selected row so Enter, Space and the context menu
 * act on it. Rows are the mounted `data-navigator-row` buttons in page order,
 * so closed rows' children are skipped. Alt+Up and Alt+Down are left to
 * reordering (`navigator/sortable.tsx`).
 */
export function NavigatorKeys() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (
        event.defaultPrevented ||
        !arrows.has(event.key) ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        keyBelongsElsewhere(event)
      )
        return;
      const navigator = document.querySelector<HTMLElement>("[data-navigator]");
      const target = event.target;
      if (
        navigator === null ||
        !(
          target === document.body ||
          (target instanceof Node && navigator.contains(target))
        )
      )
        return;
      const buttons = [
        ...navigator.querySelectorAll<HTMLElement>("[data-navigator-row]"),
      ];
      const rows: VisibleRow[] = buttons.map((button) => ({
        id: button.dataset.navigatorRow ?? "",
        depth: Number(button.dataset.navigatorDepth),
        expanded:
          button.dataset.navigatorExpanded === undefined
            ? undefined
            : button.dataset.navigatorExpanded === "true",
      }));
      // The row with focus, else the selected one.
      const current =
        target instanceof HTMLElement && buttons.includes(target)
          ? target
          : navigator.querySelector<HTMLElement>(
              "[data-selected] [data-navigator-row]",
            );
      const step = arrowStep(
        rows,
        current?.dataset.navigatorRow,
        event.key as RowArrow,
      );
      if (step === undefined) return;
      event.preventDefault();
      const button = buttons.find(
        (candidate) =>
          candidate.dataset.navigatorRow ===
          ("select" in step ? step.select : step.toggle),
      );
      if (button === undefined) return;
      if ("select" in step) {
        button.click();
        button.focus();
      } else {
        // The row's chevron, beside its selecting button.
        button.parentElement
          ?.querySelector<HTMLElement>(":scope > button[aria-expanded]")
          ?.click();
        button.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  return null;
}
