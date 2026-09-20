import { settings } from "@difracta/core";
import { z } from "zod";

const { pageMenuItemsLimit, pageMenuLabelLimit } = settings.desktop;

const item = z.object({
  /** Handed back to the page on a click, and never read as anything else. */
  id: z.string().regex(/^[\w.-]{1,64}$/),
  label: z.string().min(1).max(pageMenuLabelLimit),
  /** "Ctrl+Shift+S"; shown only, see `acceleratorFor` in `native-menu.ts`. */
  shortcutLabel: z.string().max(32).optional(),
  enabled: z.boolean(),
  separatorBefore: z.boolean().optional(),
});
const items = z.array(item).max(pageMenuItemsLimit).default([]);

// `z.object` drops keys it does not know, which is wanted here: a newer Studio
// with a menu this Desktop has no place for still gets its File and Edit.
const pageMenu = z.object({ file: items, edit: items });

export type PageMenuItem = z.infer<typeof item>;
/** The page's part of the native menu: Studio's File and Edit items. */
export type PageMenu = z.infer<typeof pageMenu>;

export const emptyPageMenu: PageMenu = { file: [], edit: [] };

/**
 * What a page sent through `setMenu`, checked. It comes from a web page,
 * possibly one served by another machine, so it is `unknown` until it has the
 * shape, within bounds: a page cannot make main build a menu of a million
 * items. Anything else is undefined, and the menu stays as it was.
 */
export function parsePageMenu(model: unknown): PageMenu | undefined {
  const parsed = pageMenu.safeParse(model);
  return parsed.success ? parsed.data : undefined;
}
