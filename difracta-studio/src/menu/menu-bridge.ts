import type { MenuModel } from "./menu-model";

/**
 * What Difracta Desktop hands every Studio window as `window.difractaMenu`,
 * whichever runtime the Studio comes from: a way to show Studio's menu in the
 * native menu bar. The page describes its menu and hears which item was
 * clicked; it can ask nothing of Desktop. Absent in a browser, where the
 * in-page bar is the menu. Desktop's side of it is
 * `difracta-desktop/src/menu-contract.ts`; keep the two in step.
 */
export interface DifractaMenu {
  /** Replaces the page's part of the native menu. */
  setMenu(model: MenuModel): void;
  /** Calls back with the `id` of a native menu item that was clicked. Returns the unsubscribe. */
  onMenuCommand(callback: (id: string) => void): () => void;
  /**
   * Calls back now and on every change with whether the window is full
   * screen, where Windows and Linux hide the native menu bar. Returns the
   * unsubscribe.
   */
  onFullScreenChange(callback: (fullScreen: boolean) => void): () => void;
}

declare global {
  interface Window {
    readonly difractaMenu?: DifractaMenu;
  }
}

export function menuBridge(): DifractaMenu | undefined {
  return window.difractaMenu;
}
