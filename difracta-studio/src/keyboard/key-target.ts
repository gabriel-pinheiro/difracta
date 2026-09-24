/**
 * Whether a key press belongs to what has focus rather than to Studio's
 * selection keys: typing in a field, moving a slider, or an open dialog or
 * menu, which handle their own keys.
 */
export function keyBelongsElsewhere(event: KeyboardEvent): boolean {
  const target = event.target;
  if (target instanceof HTMLElement) {
    if (
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
      target.isContentEditable ||
      target.closest(
        '[role="slider"], [role="textbox"], [role="combobox"], [role="spinbutton"]',
      ) !== null
    )
      return true;
  }
  return (
    document.querySelector(
      '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]',
    ) !== null
  );
}
