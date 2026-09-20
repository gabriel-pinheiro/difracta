/**
 * What every Studio window gets as `window.difractaMenu`, from the runtime
 * on this computer or from one elsewhere, and the IPC channels behind it. It
 * is the third bridge, next to `window.difractaDesktop` (local Studio only)
 * and `window.difractaLaunch` (the launch page only), and the only one handed
 * to a page from another machine. That is safe because it gives the page no
 * power over Desktop: the page describes its own menu, which main checks and
 * draws as plain labels, and hears which of its items was clicked.
 *
 * Studio declares the same shape in `difracta-studio/src/menu/menu-bridge.ts`;
 * keep the two in step. A Studio older than this bridge never calls it and
 * keeps its in-page bar, which still works.
 */
export interface DifractaMenu {
  /** Replaces the page's part of the native menu. Checked by `parsePageMenu`. */
  setMenu(model: unknown): void;
  /** Calls back with the `id` of a native menu item that was clicked. Returns the unsubscribe. */
  onMenuCommand(callback: (id: string) => void): () => void;
  /**
   * Calls back now and on every change with whether the window is full
   * screen. Windows and Linux hide the native menu bar there, so Studio shows
   * its in-page bar meanwhile. Returns the unsubscribe.
   */
  onFullScreenChange(callback: (fullScreen: boolean) => void): () => void;
}

export const menuChannels = {
  setMenu: "difracta-menu:set-menu",
  menuCommand: "difracta-menu:menu-command",
  fullScreen: "difracta-menu:full-screen",
} as const;
