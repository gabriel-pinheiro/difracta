/**
 * Keyboard focus for navigator rows, so closing the Library or removing a
 * row leaves focus on a row rather than on the page body. Rows are found by
 * the `data-navigator-row` attribute NavigatorRow puts on its selecting
 * button, with the row's depth beside it.
 */

function rowButton(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-navigator-row="${CSS.escape(id)}"]`,
  );
}

/**
 * Focuses the row for `id` after the next paint, when React has drawn it;
 * falls back to the first element matching `fallback`, such as an inspector
 * button, while the row is not mounted.
 */
export function focusNavigatorRow(id: string, fallback?: string): void {
  requestAnimationFrame(() => {
    const target =
      rowButton(id) ??
      (fallback === undefined
        ? null
        : document.querySelector<HTMLElement>(fallback));
    target?.focus();
  });
}

/**
 * The row to focus once the row for `id` is gone, read before removing it:
 * the next row in its section that is not inside it, else the one above.
 */
export function neighbourRow(id: string): string | undefined {
  const own = rowButton(id);
  const section = own?.closest("section");
  if (own === null || section === null || section === undefined)
    return undefined;
  const rows = [
    ...section.querySelectorAll<HTMLElement>("[data-navigator-row]"),
  ];
  const index = rows.indexOf(own);
  const depth = Number(own.dataset.navigatorDepth);
  const after = rows
    .slice(index + 1)
    .find((row) => Number(row.dataset.navigatorDepth) <= depth);
  return (after ?? rows[index - 1])?.dataset.navigatorRow;
}

/**
 * The header toggle of the section holding the row for `id`, read before
 * removing it, for focus once the section has no row left to take it.
 */
export function sectionHeader(id: string): HTMLElement | null {
  return (
    rowButton(id)
      ?.closest("section")
      ?.querySelector<HTMLElement>("[data-navigator-section]") ?? null
  );
}

/** Runs a removal, then focuses the row that was next to the removed one. */
export function removeFocusingNeighbour(
  id: string,
  remove: () => Promise<unknown>,
): void {
  const neighbour = neighbourRow(id);
  void remove().then(() => {
    if (neighbour !== undefined) focusNavigatorRow(neighbour);
  });
}

/**
 * Selects the row for `id` after the next paint, as a click on it would, and
 * keeps keyboard focus on it.
 */
export function selectNavigatorRow(id: string): void {
  requestAnimationFrame(() => {
    const row = rowButton(id);
    row?.click();
    row?.focus();
  });
}
