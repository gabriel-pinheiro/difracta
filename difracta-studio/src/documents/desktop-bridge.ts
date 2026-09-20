/**
 * What Difracta Desktop adds to the page when Studio runs inside it, showing
 * the runtime on the same machine: native file dialogs, and files the OS asks
 * the app to open. Absent in a browser, and in Desktop showing a runtime
 * elsewhere, so everything here is optional and feature-detected. Desktop's
 * side of it is `difracta-desktop/src/bridge-contract.ts`.
 */
export interface DifractaDesktop {
  /** A native Open dialog; the absolute path picked, or null when cancelled. */
  pickOpenPath(): Promise<string | null>;
  /** A native Save dialog, its file name filled in from `suggestedName`. */
  pickSavePath(suggestedName?: string): Promise<string | null>;
  /** Calls back with a file the OS asked Desktop to open. Returns the unsubscribe. */
  onOpenRequest(callback: (path: string) => void): () => void;
}

declare global {
  interface Window {
    readonly difractaDesktop?: DifractaDesktop;
  }
}

export function desktopBridge(): DifractaDesktop | undefined {
  return window.difractaDesktop;
}
