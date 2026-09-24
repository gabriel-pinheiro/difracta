import type { BrowserWindow } from "electron";

import type { DesktopStateStore } from "./desktop-state.ts";
import { zoomed, type ZoomChange } from "./zoom-levels.ts";

/**
 * Studio's zoom, one setting for every Studio window: kept in Desktop's state
 * file and put on each Studio window Desktop opens, local or elsewhere, so a
 * runtime elsewhere shows at the same zoom as this computer's.
 *
 * Chromium keeps a zoom level per host and shares it between the pages of
 * that host, which would zoom a runtime's Output pages with its Studio. A
 * Studio window's zoom is its own instead (`zoomMode: "isolated"`, which
 * lasts across its navigations), and an Output or a Display window cannot
 * zoom at all (`"disabled"`): a projector's page never zooms. The launch page
 * stays at 100% too.
 */
export class StudioZoom {
  readonly #state: DesktopStateStore;
  readonly #windows = new Set<BrowserWindow>();
  #level = 0;
  /** A change made before the state file was read wins over what it says. */
  #changed = false;
  #listener: () => void = () => undefined;

  constructor(state: DesktopStateStore) {
    this.#state = state;
    void state.read().then(({ zoomLevel = 0 }) => {
      if (this.#changed) return;
      this.#level = zoomLevel;
      this.#applyAll();
      this.#listener();
    });
  }

  /** The Electron zoom level every Studio window shows. */
  get level(): number {
    return this.#level;
  }

  onChange(listener: () => void): void {
    this.#listener = listener;
  }

  /** Puts the level on a Studio window, now and whenever it changes. */
  follow(window: BrowserWindow): void {
    if (this.#windows.has(window)) return;
    this.#windows.add(window);
    window.once("closed", () => this.#windows.delete(window));
    this.#apply(window);
  }

  /** Zoom In, Zoom Out or Reset Zoom: every Studio window at once, and the next launch too. */
  change(change: ZoomChange): void {
    const level = zoomed(this.#level, change);
    this.#changed = true;
    if (level === this.#level) return;
    this.#level = level;
    this.#applyAll();
    this.#listener();
    void this.#state.update((state) => ({ ...state, zoomLevel: level }));
  }

  #applyAll(): void {
    for (const window of this.#windows) this.#apply(window);
  }

  #apply(window: BrowserWindow): void {
    if (!window.isDestroyed()) window.webContents.setZoomLevel(this.#level);
  }
}
