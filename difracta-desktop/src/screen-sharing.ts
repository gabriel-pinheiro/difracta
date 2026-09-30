import { settings } from "@difracta/core";
import type { BrowserWindow, WebContents } from "electron";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";

import { withSharerActor, type DesktopStateStore } from "./desktop-state.ts";
import { hostName } from "./host-name.ts";
import { liveUrl } from "./runtime-address.ts";
import type { ShareCapture } from "./share-capture.ts";
import {
  shareChannels,
  type ShareContext,
  type ShareSourceChoice,
  type ShareSourceKind,
} from "./share-contract.ts";
import { reportedShares } from "./share-leaving.ts";
import { createShareWindow } from "./share-window.ts";

export interface ScreenSharingOptions {
  /** The session's runtime, `http://host:port`. */
  readonly origin: string;
  /** The runtime as Desktop's questions name it. */
  readonly where: string;
  /** `share-preload.cjs`. */
  readonly preload: string;
  readonly state: DesktopStateStore;
  readonly capture: ShareCapture;
}

/**
 * Desktop as a Sharer, for as long as a session lasts: the share window,
 * what its page is told, and how many shares it says it runs. The page is
 * the Sharer itself: it holds the connection to the runtime, the captures
 * and the peer connections, so main only opens it, answers what needs the
 * operating system and asks it to stop before it goes.
 *
 * A person closing the window hides it while it shares, and closes it when
 * it does not. Quitting and leaving the session stop the shares first, so
 * the runtime hears they ended and not that a connection dropped.
 */
export class ScreenSharing {
  readonly #options: ScreenSharingOptions;
  #window: BrowserWindow | undefined;
  #sharing = 0;
  /** The window is going: nothing hides it any more. */
  #released = false;
  #stopped: (() => void) | undefined;

  constructor(options: ScreenSharingOptions) {
    this.#options = options;
  }

  /** How many shares run. */
  get sharing(): number {
    return this.#sharing;
  }

  /** Whether `contents` is the share window's. */
  owns(contents: WebContents): boolean {
    const window = this.#window;
    return (
      window !== undefined &&
      !window.isDestroyed() &&
      window.webContents === contents
    );
  }

  /** Share Screen...: opens the window, or brings the open one to the front. */
  show(): void {
    if (this.#released) return;
    let window = this.#window;
    if (window === undefined || window.isDestroyed()) {
      window = createShareWindow({
        preload: this.#options.preload,
        mayClose: () => this.#released || this.#sharing === 0,
      });
      this.#window = window;
      const opened = window;
      window.on("closed", () => {
        if (this.#window !== opened) return;
        this.#window = undefined;
        this.#report(0);
      });
    }
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }

  async context(): Promise<ShareContext> {
    const { origin, where, state, capture } = this.#options;
    const known = await state.update((current) =>
      withSharerActor(current, () => `desktop-${randomUUID()}`),
    );
    return {
      liveUrl: liveUrl(origin),
      where,
      sharer: hostName(hostname()),
      actor: known.sharerActor ?? "",
      picker: capture.picker,
      screenAccess: capture.screenAccess(),
    };
  }

  sources(kind: ShareSourceKind): Promise<ShareSourceChoice[]> {
    return this.#options.capture.sources(
      kind,
      this.#window?.getMediaSourceId(),
    );
  }

  choose(id: string | null): boolean {
    return this.#options.capture.choose(id);
  }

  /** What the page says it runs. */
  report(sharing: unknown): void {
    this.#report(reportedShares(sharing));
  }

  /** Nothing hides the window from now on: a quit closes every window, this one too. */
  release(): void {
    this.#released = true;
  }

  /**
   * Stops every share and closes the window. The page is asked to stop, so
   * that the runtime hears each share ended, and gets
   * `settings.desktop.shareStopTimeoutMs` to say it has.
   */
  async stop(): Promise<void> {
    this.release();
    const window = this.#window;
    if (window === undefined || window.isDestroyed()) return;
    if (this.#sharing > 0) {
      const stopped = new Promise<void>((resolve) => {
        this.#stopped = resolve;
      });
      window.webContents.send(shareChannels.stopAll);
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([
        stopped,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, settings.desktop.shareStopTimeoutMs);
        }),
      ]);
      clearTimeout(timer);
      this.#stopped = undefined;
    }
    if (!window.isDestroyed()) window.destroy();
    this.#window = undefined;
    this.#sharing = 0;
  }

  #report(sharing: number): void {
    this.#sharing = sharing;
    if (sharing === 0) this.#stopped?.();
  }
}
