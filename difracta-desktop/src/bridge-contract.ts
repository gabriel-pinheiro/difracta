/**
 * What the preload script exposes to Studio as `window.difractaDesktop`, and
 * the IPC channels behind it. The bridge is the only thing a page can reach in
 * Desktop, so it carries only what needs the operating system: native file
 * pickers (the Installation's, and a Media file's), and files the OS asks the
 * app to open. Everything else Studio does goes to the runtime, where the CLI
 * can do it too.
 *
 * Studio declares the same shape in
 * `difracta-studio/src/documents/desktop-bridge.ts`; keep the two in step.
 */
export interface DifractaDesktop {
  /** A native Open dialog; the absolute path picked, or null when cancelled. */
  pickOpenPath(): Promise<string | null>;
  /** A native Save dialog, its file name filled in with `<suggestedName>.difracta`. */
  pickSavePath(suggestedName?: string): Promise<string | null>;
  /**
   * A native Open dialog filtered to the images and videos Difracta shows;
   * the absolute path picked, or null when cancelled. Studio relativizes it
   * against the Installation file's folder before `media.create`.
   */
  pickMediaPath(): Promise<string | null>;
  /**
   * Calls back with a file the OS asked Desktop to open while it was already
   * running (a double click, a second launch). Returns the unsubscribe.
   */
  onOpenRequest(callback: (path: string) => void): () => void;
}

export const channels = {
  pickOpenPath: "difracta:pick-open-path",
  pickSavePath: "difracta:pick-save-path",
  pickMediaPath: "difracta:pick-media-path",
  openRequest: "difracta:open-request",
} as const;

/** How main tells a Studio window's preload which origin may have its bridges (see `menu-expose.ts`). */
export const BRIDGE_ORIGIN_ARGUMENT = "--difracta-bridge-origin=";
