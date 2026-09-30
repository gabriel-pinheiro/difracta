import type { Catalog, Document, MediaBeats } from "@difracta/core";

import type { ShareSignalling } from "./live-peer.ts";
import { LiveViewer, type ShareCount } from "./live-viewer.ts";
import { wantedShares } from "./live-wanted.ts";
import { MediaLoader, type VideoCount } from "./media-loader.ts";
import type { LiveSource } from "./shared-viewer.ts";
import type {
  MediaContext,
  MediaHandle,
  MediaLive,
  MediaVideo,
} from "./sdk/media.ts";

export interface EngineMediaOptions {
  readonly catalog: Catalog;
  readonly mediaUrl: (id: string) => string | undefined;
  readonly shares: ShareSignalling | undefined;
  /** A Viewer shared with the rest of the page, in place of one of its own over `shares`. */
  readonly viewer?: LiveSource | undefined;
}

/**
 * The Media one compositor's instances reach: the files and bundled items
 * the loader holds (`media-loader.ts`) and the Screen Shares the Viewer
 * receives (`live-viewer.ts`), or a claim on a Viewer the page shares
 * among several compositors (`shared-viewer.ts`). `sync` brings both in step with a document
 * on an Output, the Viewer with the shares wanted there, worked out once
 * per document and Output since a document is immutable per revision.
 */
export class EngineMedia implements MediaContext {
  readonly #catalog: Catalog;
  readonly #loader: MediaLoader;
  readonly #viewer: LiveSource;
  #wantedFor:
    | { document: Document; outputId: string; shares: ReadonlySet<string> }
    | undefined;

  constructor(options: EngineMediaOptions) {
    this.#catalog = options.catalog;
    this.#loader = new MediaLoader({
      mediaUrl: options.mediaUrl,
      catalog: options.catalog,
    });
    this.#viewer =
      options.viewer ?? new LiveViewer({ signalling: options.shares });
  }

  sync(document: Document, outputId: string): void {
    this.#loader.sync(document.media);
    const last = this.#wantedFor;
    if (last?.document !== document || last.outputId !== outputId) {
      const shares = wantedShares(document, outputId, this.#catalog);
      // The same shares as before keep their set, so the Viewer sees no change.
      this.#wantedFor = {
        document,
        outputId,
        shares:
          last !== undefined && same(last.shares, shares)
            ? last.shares
            : shares,
      };
    }
    this.#viewer.sync(this.#wantedFor?.shares ?? new Set(), document.media);
  }

  /** Starts the video preloads waiting for a turn, the wanted items first. */
  preload(wanted: () => ReadonlySet<string>): void {
    this.#loader.preload(wanted);
  }

  get(id: string): MediaHandle | undefined {
    return this.#loader.get(id);
  }

  video(id: string): MediaVideo | undefined {
    return this.#loader.video(id);
  }

  beats(id: string): MediaBeats | undefined {
    return this.#loader.beats(id);
  }

  live(id: string): MediaLive | undefined {
    return this.#viewer.live(id);
  }

  videos(): VideoCount {
    return this.#loader.videos();
  }

  shares(): ShareCount {
    return this.#viewer.shares();
  }

  dispose(): void {
    this.#viewer.dispose();
    this.#loader.dispose();
    this.#wantedFor = undefined;
  }
}

function same(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}
