import type { Share, Table } from "@difracta/core";

import type { LiveViewerOptions } from "./live-peer.ts";
import { LiveViewer, type ShareCount } from "./live-viewer.ts";
import type { MediaLive } from "./sdk/media.ts";

/**
 * The Screen Shares one user of a Viewer reads: what `EngineMedia` holds as
 * its Viewer. A `LiveViewer` is one; so is a claim on a `SharedViewer`.
 * `sync` says which slots this user wants now, `dispose` that it wants
 * none any more.
 */
export interface LiveSource {
  sync(wanted: ReadonlySet<string>, shares: Table<Share>): void;
  live(id: string): MediaLive | undefined;
  shares(): ShareCount;
  dispose(): void;
}

/** A claim on a `SharedViewer`: one place of the page that may show shares. */
export interface ViewerClaim extends LiveSource {
  /** Wants nothing until the next `sync`, as while its picture is not on screen. */
  pause(): void;
}

const NONE: ReadonlySet<string> = new Set();

/**
 * One Viewer for a whole page with several places that show shares, such as
 * Studio's Preview, the crop editor and a slot's inspector. A connection can
 * view a slot only once: the Sharer offers once per Viewer, so two engines
 * on one connection would both answer the same offer. Each place takes a
 * `claim` and syncs what it wants through it as it would a `LiveViewer`;
 * the shared one views the union, a slot while any claim wants it, and
 * leaves it `leaveAfterMs` after the last one stopped, as a `LiveViewer`
 * does. Every claim reads the same pictures.
 */
export class SharedViewer {
  readonly #viewer: LiveViewer;
  readonly #claims = new Map<object, ReadonlySet<string>>();
  #wanted: ReadonlySet<string> = NONE;
  #shares: Table<Share> = {};
  #disposed = false;

  constructor(options: LiveViewerOptions = {}) {
    this.#viewer = new LiveViewer(options);
  }

  /** How many claims are held; a claim wanting nothing still counts. */
  get claims(): number {
    return this.#claims.size;
  }

  /** The slots viewed for the claims now, their union. */
  get wanted(): ReadonlySet<string> {
    return this.#wanted;
  }

  claim(): ViewerClaim {
    const key = {};
    this.#claims.set(key, NONE);
    const set = (wanted: ReadonlySet<string>, shares?: Table<Share>): void => {
      if (!this.#claims.has(key)) return;
      const before = this.#claims.get(key);
      if (
        before === wanted &&
        (shares === undefined || shares === this.#shares)
      )
        return;
      this.#claims.set(key, wanted);
      if (shares !== undefined) this.#shares = shares;
      this.#update();
    };
    return {
      sync: (wanted, shares) => set(wanted, shares),
      pause: () => set(NONE),
      live: (id) => this.#viewer.live(id),
      shares: () => this.#viewer.shares(),
      dispose: () => {
        if (!this.#claims.delete(key)) return;
        this.#update();
      },
    };
  }

  /** What the page views of a slot, whichever claim asked for it. */
  live(id: string): MediaLive | undefined {
    return this.#viewer.live(id);
  }

  dispose(): void {
    this.#disposed = true;
    this.#claims.clear();
    this.#viewer.dispose();
  }

  #update(): void {
    if (this.#disposed) return;
    const union = new Set<string>();
    for (const wanted of this.#claims.values())
      for (const id of wanted) union.add(id);
    // The same slots keep their set, so the Viewer sees no change.
    if (!same(union, this.#wanted)) this.#wanted = union;
    this.#viewer.sync(this.#wanted, this.#shares);
  }
}

function same(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}
